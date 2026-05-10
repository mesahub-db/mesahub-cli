import { Command } from 'commander'
import { createInterface } from 'readline'
import { getConfigOrExit, getBaseUrl } from '../config.js'

interface BucketRecord {
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

async function fetchBuckets(token: string): Promise<BucketRecord[]> {
  const res = await apiFetch(token, '/api/user/buckets')
  if (!res.ok) {
    if (res.status === 404) throw new Error('Buckets are not enabled on this instance')
    throw new Error(`HTTP ${res.status}`)
  }
  return res.json() as Promise<BucketRecord[]>
}

async function resolveBucket(input: string, token: string): Promise<BucketRecord> {
  const buckets = await fetchBuckets(token)
  const match = buckets.find(b => b.slug === input || b.name === input || b.id === input)
  if (!match) {
    const names = buckets.map(b => `  ${b.name} (${b.slug})`).join('\n')
    console.error(`Bucket "${input}" not found. Available buckets:\n${names}`)
    process.exit(1)
  }
  return match
}

function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  return new Promise(resolve => rl.question(question, ans => { rl.close(); resolve(ans) }))
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
}

export function registerBucketCommands(program: Command): void {
  const buckets = program.command('buckets').description('Manage your file buckets')

  buckets
    .command('list')
    .description('List all your buckets')
    .action(async () => {
      const config = getConfigOrExit()
      try {
        const list = await fetchBuckets(config.token)

        if (list.length === 0) {
          console.log('No buckets found.')
          return
        }

        const pad = (s: string, n: number) => s.padEnd(n)
        const header = `  ${pad('NAME', 28)} ${pad('REF', 20)} ${pad('STATUS', 10)} ${pad('SIZE', 12)} CREATED`
        console.log(header)
        console.log('  ' + '-'.repeat(header.length - 2))

        for (const b of list) {
          const size    = formatBytes(b.size_bytes)
          const created = new Date(b.created_at).toLocaleDateString()
          console.log(`  ${pad(b.name, 28)} ${pad(b.slug, 20)} ${pad(b.status, 10)} ${pad(size, 12)} ${created}`)
        }
      } catch (err) {
        console.error(`Error: ${err instanceof Error ? err.message : String(err)}`)
        process.exit(1)
      }
    })

  buckets
    .command('create <name>')
    .description('Create a new bucket')
    .option('-d, --description <desc>', 'Optional description')
    .action(async (name: string, opts: { description?: string }) => {
      const config = getConfigOrExit()
      try {
        const res = await apiFetch(config.token, '/api/user/buckets', {
          method: 'POST',
          body: JSON.stringify({ name, description: opts.description }),
        })
        const data = await res.json() as { error?: string; id?: string; name?: string; slug?: string }
        if (!res.ok) {
          console.error(`Error: ${data.error ?? `HTTP ${res.status}`}`)
          process.exit(1)
        }
        console.log(`Bucket created: ${data.name} (${data.slug})`)
      } catch (err) {
        console.error(`Error: ${err instanceof Error ? err.message : String(err)}`)
        process.exit(1)
      }
    })

  buckets
    .command('delete <name-or-ref>')
    .description('Delete a bucket (irreversible)')
    .option('-f, --force', 'Skip confirmation prompt')
    .action(async (input: string, opts: { force?: boolean }) => {
      const config = getConfigOrExit()
      try {
        const record = await resolveBucket(input, config.token)
        if (!opts.force) {
          const answer = await prompt(`Delete bucket "${record.name}" (${record.slug})? This cannot be undone. [y/N] `)
          if (answer.toLowerCase() !== 'y') {
            console.log('Aborted.')
            return
          }
        }
        const res = await apiFetch(config.token, `/api/user/buckets/${record.id}`, { method: 'DELETE' })
        if (!res.ok) {
          const data = await res.json().catch(() => ({})) as { error?: string }
          console.error(`Error: ${data.error ?? `HTTP ${res.status}`}`)
          process.exit(1)
        }
        console.log(`Bucket "${record.name}" deleted.`)
      } catch (err) {
        console.error(`Error: ${err instanceof Error ? err.message : String(err)}`)
        process.exit(1)
      }
    })

  buckets
    .command('rename <name-or-ref> <new-name>')
    .description('Rename a bucket')
    .action(async (input: string, newName: string) => {
      const config = getConfigOrExit()
      try {
        const record = await resolveBucket(input, config.token)
        const res = await apiFetch(config.token, `/api/user/buckets/${record.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ name: newName }),
        })
        const data = await res.json() as { error?: string; name?: string }
        if (!res.ok) {
          console.error(`Error: ${data.error ?? `HTTP ${res.status}`}`)
          process.exit(1)
        }
        console.log(`Bucket renamed to: ${data.name}`)
      } catch (err) {
        console.error(`Error: ${err instanceof Error ? err.message : String(err)}`)
        process.exit(1)
      }
    })
}
