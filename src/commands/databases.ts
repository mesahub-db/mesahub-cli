import { Command } from 'commander'
import { createInterface } from 'readline'
import { createReadStream, writeFileSync, existsSync } from 'fs'
import { getConfigOrExit, getBaseUrl, getApiUrl, setActiveDb, getActiveDb } from '../config.js'
import { MesahubClient } from '@mesahub/client'

interface DatabaseRecord {
  id: string
  name: string
  slug: string
  description?: string
  status: string
  size_bytes: number
  created_at: string
}

async function apiFetch(token: string, path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(`${getBaseUrl()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })
  return res
}

async function fetchDatabases(token: string): Promise<DatabaseRecord[]> {
  const res = await apiFetch(token, '/api/user/databases')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json() as Promise<DatabaseRecord[]>
}

/** Resolve a user-supplied name/slug/id to the canonical slug (for data-plane ops). */
async function resolveRef(input: string, token: string): Promise<string> {
  const dbs = await fetchDatabases(token)
  const match = dbs.find(d => d.slug === input || d.name === input || d.id === input)
  if (!match) {
    const names = dbs.map(d => `  ${d.name} (${d.slug})`).join('\n')
    console.error(`Database "${input}" not found. Available databases:\n${names}`)
    process.exit(1)
  }
  return match.slug
}

/** Resolve a user-supplied name/slug/id to the full record (for management ops). */
async function resolveDb(input: string, token: string): Promise<DatabaseRecord> {
  const dbs = await fetchDatabases(token)
  const match = dbs.find(d => d.slug === input || d.name === input || d.id === input)
  if (!match) {
    const names = dbs.map(d => `  ${d.name} (${d.slug})`).join('\n')
    console.error(`Database "${input}" not found. Available databases:\n${names}`)
    process.exit(1)
  }
  return match
}

function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  return new Promise(resolve => rl.question(question, ans => { rl.close(); resolve(ans) }))
}

export function registerDatabaseCommands(program: Command): void {
  const db = program.command('databases').alias('db').description('Manage your databases')

  db
    .command('list')
    .description('List all your databases')
    .action(async () => {
      const config = getConfigOrExit()
      try {
        const databases = await fetchDatabases(config.token)

        if (databases.length === 0) {
          console.log('No databases found.')
          return
        }

        const activeDb = getActiveDb()
        const pad = (s: string, n: number) => s.padEnd(n)
        const header = `  ${pad('NAME', 28)} ${pad('REF', 20)} ${pad('STATUS', 10)} ${pad('SIZE', 12)} CREATED`
        console.log(header)
        console.log('  ' + '-'.repeat(header.length - 2))

        for (const d of databases) {
          const size    = formatBytes(d.size_bytes)
          const created = new Date(d.created_at).toLocaleDateString()
          const marker  = d.slug === activeDb ? '* ' : '  '
          console.log(`${marker}${pad(d.name, 28)} ${pad(d.slug, 20)} ${pad(d.status, 10)} ${pad(size, 12)} ${created}`)
        }

        if (activeDb) console.log(`\n* active database`)
      } catch (err) {
        console.error(`Error: ${err instanceof Error ? err.message : String(err)}`)
        process.exit(1)
      }
    })

  db
    .command('create <name>')
    .description('Create a new database')
    .option('-d, --description <desc>', 'Optional description')
    .action(async (name: string, opts: { description?: string }) => {
      const config = getConfigOrExit()
      try {
        const res = await apiFetch(config.token, '/api/user/databases', {
          method: 'POST',
          body: JSON.stringify({ name, description: opts.description }),
        })
        const data = await res.json() as { error?: string; id?: string; name?: string; slug?: string }
        if (!res.ok) {
          console.error(`Error: ${data.error ?? `HTTP ${res.status}`}`)
          process.exit(1)
        }
        console.log(`Database created: ${data.name} (${data.slug})`)
      } catch (err) {
        console.error(`Error: ${err instanceof Error ? err.message : String(err)}`)
        process.exit(1)
      }
    })

  db
    .command('delete <name-or-ref>')
    .description('Delete a database (irreversible)')
    .option('-f, --force', 'Skip confirmation prompt')
    .action(async (input: string, opts: { force?: boolean }) => {
      const config = getConfigOrExit()
      try {
        const record = await resolveDb(input, config.token)
        if (!opts.force) {
          const answer = await prompt(`Delete database "${record.name}" (${record.slug})? This cannot be undone. [y/N] `)
          if (answer.toLowerCase() !== 'y') {
            console.log('Aborted.')
            return
          }
        }
        const res = await apiFetch(config.token, `/api/user/databases/${record.id}`, { method: 'DELETE' })
        if (!res.ok) {
          const data = await res.json().catch(() => ({})) as { error?: string }
          console.error(`Error: ${data.error ?? `HTTP ${res.status}`}`)
          process.exit(1)
        }
        console.log(`Database "${record.name}" deleted.`)
      } catch (err) {
        console.error(`Error: ${err instanceof Error ? err.message : String(err)}`)
        process.exit(1)
      }
    })

  db
    .command('rename <name-or-ref> <new-name>')
    .description('Rename a database')
    .action(async (input: string, newName: string) => {
      const config = getConfigOrExit()
      try {
        const record = await resolveDb(input, config.token)
        const res = await apiFetch(config.token, `/api/user/databases/${record.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ name: newName }),
        })
        const data = await res.json() as { error?: string; name?: string }
        if (!res.ok) {
          console.error(`Error: ${data.error ?? `HTTP ${res.status}`}`)
          process.exit(1)
        }
        console.log(`Database renamed to: ${data.name}`)
      } catch (err) {
        console.error(`Error: ${err instanceof Error ? err.message : String(err)}`)
        process.exit(1)
      }
    })

  db
    .command('use <name-or-ref>')
    .description('Set the active database (used by default in query/exec)')
    .action(async (input: string) => {
      const config = getConfigOrExit()
      const slug = await resolveRef(input, config.token)
      setActiveDb(slug)
      console.log(`Active database set to: ${slug}`)
    })

  db
    .command('query [ref]')
    .description('Run a SQL query (SELECT/WITH/PRAGMA) against a database')
    .requiredOption('--sql <sql>', 'SQL statement to execute')
    .action(async (ref: string | undefined, opts: { sql: string }) => {
      const input = ref ?? getActiveDb()
      if (!input) {
        console.error('No database specified. Pass a <name-or-ref> or run: mesahub db use <name>')
        process.exit(1)
      }
      const config = getConfigOrExit()
      const resolvedRef = await resolveRef(input, config.token)
      const client = new MesahubClient({ apiKey: config.token, apiUrl: getApiUrl() })
      try {
        const t0 = Date.now()
        const result = await client.query(resolvedRef, opts.sql)
        const elapsed = Date.now() - t0
        if (result.rows.length === 0) {
          const serverMs = result.queryDurationMs != null ? `  (server ${result.queryDurationMs}ms)` : ''
          console.log(`No rows returned.  ·  ${elapsed}ms${serverMs}`)
          return
        }
        printTable(result.columns, result.rows)
        const serverMs = result.queryDurationMs != null ? `  (server ${result.queryDurationMs}ms)` : ''
        console.log(`\n${result.rows.length} row(s)  ·  ${elapsed}ms${serverMs}`)
      } catch (err) {
        console.error(`Error: ${err instanceof Error ? err.message : String(err)}`)
        process.exit(1)
      }
    })

  db
    .command('exec [ref]')
    .description('Execute a write statement (INSERT/UPDATE/DELETE/DDL) against a database')
    .requiredOption('--sql <sql>', 'SQL statement to execute')
    .action(async (ref: string | undefined, opts: { sql: string }) => {
      const input = ref ?? getActiveDb()
      if (!input) {
        console.error('No database specified. Pass a <name-or-ref> or run: mesahub db use <name>')
        process.exit(1)
      }
      const config = getConfigOrExit()
      const resolvedRef = await resolveRef(input, config.token)
      const client = new MesahubClient({ apiKey: config.token, apiUrl: getApiUrl() })
      try {
        const t0 = Date.now()
        const result = await client.exec(resolvedRef, opts.sql)
        const elapsed = Date.now() - t0
        const serverMs = result.queryDurationMs != null ? `  (server ${result.queryDurationMs}ms)` : ''
        console.log(`Rows affected: ${result.rowsAffected}  ·  ${elapsed}ms${serverMs}`)
        if (result.lastInsertRowid !== undefined) {
          console.log(`Last insert rowid: ${result.lastInsertRowid}`)
        }
      } catch (err) {
        console.error(`Error: ${err instanceof Error ? err.message : String(err)}`)
        process.exit(1)
      }
    })

  db
    .command('import <name-or-ref> <file>')
    .description('Import tables from a SQLite file into a database')
    .option('--tables <tables>', 'Comma-separated list of tables to import (default: all)')
    .action(async (input: string, file: string, opts: { tables?: string }) => {
      const config = getConfigOrExit()
      if (!existsSync(file)) {
        console.error(`File not found: ${file}`)
        process.exit(1)
      }
      try {
        const record = await resolveDb(input, config.token)

        let selectedTables: string[]

        if (opts.tables) {
          selectedTables = opts.tables.split(',').map(t => t.trim()).filter(Boolean)
        } else {
          // Phase 1: inspect the file to get available tables
          const fd1 = new FormData()
          const bytes1 = await import('fs/promises').then(fs => fs.readFile(file))
          fd1.append('file', new Blob([bytes1]), file.split('/').pop() ?? 'import.db')

          const res1 = await fetch(`${getBaseUrl()}/api/user/databases/${record.id}/import`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${config.token}` },
            body: fd1,
          })
          if (!res1.ok) {
            const err = await res1.json().catch(() => ({})) as { error?: string }
            console.error(`Error inspecting file: ${err.error ?? `HTTP ${res1.status}`}`)
            process.exit(1)
          }
          const phase1 = await res1.json() as { tables: string[] }
          const tables = phase1.tables ?? []

          if (tables.length === 0) {
            console.error('No tables found in the SQLite file.')
            process.exit(1)
          }

          console.log(`Tables found in file:`)
          tables.forEach((t, i) => console.log(`  ${i + 1}. ${t}`))
          const ans = await prompt(`Import all ${tables.length} table(s)? [Y/n] `)
          if (ans.toLowerCase() === 'n') {
            const selection = await prompt('Enter table names to import (comma-separated): ')
            selectedTables = selection.split(',').map(t => t.trim()).filter(Boolean)
          } else {
            selectedTables = tables
          }
        }

        if (selectedTables.length === 0) {
          console.error('No tables selected.')
          process.exit(1)
        }

        // Phase 2: import selected tables
        const bytes2 = await import('fs/promises').then(fs => fs.readFile(file))
        const fd2 = new FormData()
        fd2.append('file', new Blob([bytes2]), file.split('/').pop() ?? 'import.db')
        fd2.append('tables', JSON.stringify(selectedTables))

        console.log(`Importing ${selectedTables.length} table(s) into "${record.name}"...`)
        const res2 = await fetch(`${getBaseUrl()}/api/user/databases/${record.id}/import`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${config.token}` },
          body: fd2,
        })
        const data2 = await res2.json() as { error?: string; rows_imported?: number; size_bytes?: number }
        if (!res2.ok) {
          console.error(`Error: ${data2.error ?? `HTTP ${res2.status}`}`)
          process.exit(1)
        }
        console.log(`Import complete. Tables: ${selectedTables.join(', ')}`)
        if (data2.rows_imported != null) console.log(`Rows imported: ${data2.rows_imported}`)
        if (data2.size_bytes != null) console.log(`New size: ${formatBytes(data2.size_bytes)}`)
      } catch (err) {
        console.error(`Error: ${err instanceof Error ? err.message : String(err)}`)
        process.exit(1)
      }
    })

  db
    .command('export <name-or-ref>')
    .description('Export a database to a SQLite file')
    .option('-o, --output <file>', 'Output file path (default: <name>-<timestamp>.sqlite)')
    .option('--tables <tables>', 'Comma-separated list of tables to export (default: all)')
    .action(async (input: string, opts: { output?: string; tables?: string }) => {
      const config = getConfigOrExit()
      try {
        const record = await resolveDb(input, config.token)
        const client = new MesahubClient({ apiKey: config.token, apiUrl: getApiUrl() })

        let selectedTables: string[]

        if (opts.tables) {
          selectedTables = opts.tables.split(',').map(t => t.trim()).filter(Boolean)
        } else {
          // Query sqlite_master for all user tables
          const result = await client.query(
            record.slug,
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
          )
          selectedTables = result.rows.map(r => String(r['name']))
          if (selectedTables.length === 0) {
            console.error('No tables found in the database.')
            process.exit(1)
          }
          console.log(`Exporting ${selectedTables.length} table(s): ${selectedTables.join(', ')}`)
        }

        const outputFile = opts.output ?? `${record.slug}-${Date.now()}.sqlite`

        const res = await apiFetch(config.token, `/api/user/databases/${record.id}/export`, {
          method: 'POST',
          body: JSON.stringify({ tables: selectedTables, filename: record.slug }),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({})) as { error?: string }
          console.error(`Error: ${err.error ?? `HTTP ${res.status}`}`)
          process.exit(1)
        }
        const buf = Buffer.from(await res.arrayBuffer())
        writeFileSync(outputFile, buf)
        console.log(`Exported to: ${outputFile} (${formatBytes(buf.length)})`)
      } catch (err) {
        console.error(`Error: ${err instanceof Error ? err.message : String(err)}`)
        process.exit(1)
      }
    })
}

function printTable(cols: string[], rows: Record<string, unknown>[]): void {
  const pad = (s: string, n: number) => String(s ?? '').padEnd(n)
  const widths = cols.map(c =>
    Math.max(c.length, ...rows.map(r => String(r[c] ?? '').length))
  )
  console.log(cols.map((c, i) => pad(c, widths[i])).join('  '))
  console.log(widths.map(w => '-'.repeat(w)).join('  '))
  for (const row of rows) {
    console.log(cols.map((c, i) => pad(String(row[c] ?? ''), widths[i])).join('  '))
  }
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
}
