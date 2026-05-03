import { Command } from 'commander'
import { getConfigOrExit, getBaseUrl, getApiUrl, setActiveDb, getActiveDb } from '../config.js'
import { MesahubClient } from '@mesahub/client'

interface DatabaseRecord {
  id: string
  name: string
  slug: string
  status: string
  size_bytes: number
  created_at: string
}

async function fetchDatabases(token: string): Promise<DatabaseRecord[]> {
  const res = await fetch(`${getBaseUrl()}/api/user/databases`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json() as Promise<DatabaseRecord[]>
}

/** Resolve a user-supplied name or slug to the canonical slug. */
async function resolveRef(input: string, token: string): Promise<string> {
  const dbs = await fetchDatabases(token)
  const match = dbs.find(d => d.slug === input || d.name === input)
  if (!match) {
    const names = dbs.map(d => `  ${d.name} (${d.slug})`).join('\n')
    console.error(`Database "${input}" not found. Available databases:\n${names}`)
    process.exit(1)
  }
  return match.slug
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
        console.error('No database specified. Pass a <name-or-ref> or run: sqlite-hub db use <name>')
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
        console.error('No database specified. Pass a <name-or-ref> or run: sqlite-hub db use <name>')
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

  // Note: database creation is only available via the control panel web UI.
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
