import { Command } from 'commander'
import { getConfigOrExit, getBaseUrl } from '../config.js'

interface ApiKeyRecord {
  id: string
  name: string
  scopes: string[]
  status: string
  created_at: string
  last_used_at: string | null
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
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`HTTP ${res.status}${text ? ': ' + text : ''}`)
  }
  return res
}

export function registerKeyCommands(program: Command): void {
  const keys = program.command('keys').description('Manage API keys')

  keys
    .command('list')
    .description('List all active API keys')
    .action(async () => {
      const config = getConfigOrExit()
      try {
        const res = await apiFetch(config.token, '/api/user/api-keys')
        const apiKeys = await res.json() as ApiKeyRecord[]

        if (apiKeys.length === 0) {
          console.log('No API keys found.')
          return
        }

        const pad = (s: string, n: number) => s.padEnd(n)
        const header = `${pad('ID', 38)} ${pad('NAME', 24)} ${pad('SCOPES', 16)} CREATED`
        console.log(header)
        console.log('-'.repeat(header.length))

        for (const key of apiKeys) {
          const created = new Date(key.created_at).toLocaleDateString()
          const scopes  = (key.scopes ?? []).join(', ')
          console.log(`${pad(key.id, 38)} ${pad(key.name, 24)} ${pad(scopes, 16)} ${created}`)
        }
      } catch (err) {
        console.error(`Error: ${err instanceof Error ? err.message : String(err)}`)
        process.exit(1)
      }
    })

  keys
    .command('create <name>')
    .description('Create a new API key with full write access')
    .action(async (name: string) => {
      const config = getConfigOrExit()
      try {
        const res = await apiFetch(config.token, '/api/user/api-keys', {
          method: 'POST',
          body: JSON.stringify({ name, scopes: ['all:w'] }),
        })
        const key = await res.json() as { name: string; key: string }
        console.log(`API key created: ${key.name}`)
        console.log()
        console.log(`  Token: ${key.key}`)
        console.log()
        console.log('Save this token — it will not be shown again.')
      } catch (err) {
        console.error(`Error: ${err instanceof Error ? err.message : String(err)}`)
        process.exit(1)
      }
    })

  keys
    .command('revoke <id>')
    .description('Revoke an API key by ID')
    .action(async (id: string) => {
      const config = getConfigOrExit()
      try {
        await apiFetch(config.token, `/api/user/api-keys/${id}`, { method: 'DELETE' })
        console.log(`API key ${id} revoked.`)
      } catch (err) {
        console.error(`Error: ${err instanceof Error ? err.message : String(err)}`)
        process.exit(1)
      }
    })
}
