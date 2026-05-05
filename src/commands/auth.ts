import { Command } from 'commander'
import { createServer } from 'http'
import { exec } from 'child_process'
import { randomBytes } from 'crypto'
import { hostname } from 'os'
import { writeConfig, deleteConfig, readConfig, getConfigOrExit, getBaseUrl } from '../config.js'

const DEFAULT_BASE_URL = 'https://www.mesahub.app'

function openBrowser(url: string): void {
  const cmd =
    process.platform === 'darwin'  ? `open "${url}"` :
    process.platform === 'win32'   ? `start "" "${url}"` :
                                     `xdg-open "${url}"`
  exec(cmd, (err) => {
    if (err) console.warn('  Could not open browser automatically — please open the URL above manually.')
  })
}

export function registerAuthCommands(program: Command): void {
  const auth = program.command('auth').description('Manage authentication')

  auth
    .command('login')
    .description('Authenticate with your MesaHub account via browser')
    .option('--base-url <url>', `Control plane URL (default: ${DEFAULT_BASE_URL})`)
    .action(async (opts: { baseUrl?: string }) => {
      const baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '')

      // Pick a random unprivileged port and generate a CSRF state token
      const port  = Math.floor(Math.random() * (65535 - 49152 + 1)) + 49152
      const state = randomBytes(16).toString('hex')
      const host  = hostname()

      const callbackBase = `http://127.0.0.1:${port}`
      const loginUrl =
        `${baseUrl}/cli/auth` +
        `?callback=${encodeURIComponent(callbackBase)}` +
        `&state=${state}` +
        `&hostname=${encodeURIComponent(host)}`

      console.log()
      console.log('Opening browser to authenticate…')
      console.log(`  ${loginUrl}`)
      console.log()
      console.log('Waiting for authorization (120s timeout)…')

      openBrowser(loginUrl)

      try {
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => {
            server.closeAllConnections?.()
            server.close()
            reject(new Error('Timed out after 120 seconds. Please try again.'))
          }, 120_000)

          const server = createServer((req, res) => {
            const url            = new URL(req.url ?? '/', callbackBase)
            const receivedState  = url.searchParams.get('state')
            const token          = url.searchParams.get('token')
            const apiUrl         = url.searchParams.get('api_url') ?? undefined
            const error          = url.searchParams.get('error')

            const html = (title: string, body: string) =>
              `<!DOCTYPE html><html><head><title>${title} — mesahub</title>` +
              `<style>*{box-sizing:border-box}body{margin:0;font-family:system-ui,sans-serif;` +
              `display:flex;align-items:center;justify-content:center;min-height:100vh;` +
              `background:#0a0a0a;color:#e5e5e5}` +
              `.card{text-align:center;padding:2rem 2.5rem;max-width:380px;` +
              `border:1px solid #262626;border-radius:1rem;background:#111}` +
              `h1{font-size:1.1rem;margin:0 0 .6rem}p{color:#737373;font-size:.875rem;margin:.3rem 0}` +
              `</style></head><body><div class="card"><h1>${title}</h1>${body}` +
              `<p style="margin-top:1.2rem;font-size:.75rem">You can close this tab.</p>` +
              `</div></body></html>`

            res.setHeader('Content-Type', 'text/html; charset=utf-8')
            res.writeHead(200)

            if (error === 'cancelled') {
              res.end(html('Authorization cancelled', '<p>You cancelled the login flow.</p>'))
              clearTimeout(timer); server.closeAllConnections?.(); server.close()
              reject(new Error('Authorization cancelled.'))
              return
            }

            if (receivedState !== state) {
              res.end(html('Invalid state', '<p>State mismatch. Please try again.</p>'))
              clearTimeout(timer); server.closeAllConnections?.(); server.close()
              reject(new Error('State mismatch — possible CSRF.'))
              return
            }

            if (!token || !token.startsWith('shs_')) {
              res.end(html('Missing token', '<p>No token received. Please try again.</p>'))
              clearTimeout(timer); server.closeAllConnections?.(); server.close()
              reject(new Error('No valid token received.'))
              return
            }

            writeConfig({ token, baseUrl, apiUrl })
            res.end(html('Logged in', '<p>Return to your terminal to continue.</p>'))
            clearTimeout(timer)
            server.closeAllConnections?.()
            server.close()
            resolve()
          })

          server.unref()
          server.listen(port, '127.0.0.1')
        })

        // Fetch profile to show "Logged in as" message
        const config = readConfig()!
        let identity = ''
        try {
          const res = await fetch(`${config.baseUrl}/api/user/profile`, {
            headers: { Authorization: `Bearer ${config.token}` },
          })
          if (res.ok) {
            const user = await res.json() as { email: string; plan: string }
            identity = ` as ${user.email} (${user.plan} plan)`
          }
        } catch { /* non-fatal */ }

        console.log()
        console.log(`✓ Logged in${identity}`)
        console.log()
        console.log('  mesahub auth whoami   — confirm your identity')
        console.log('  mesahub db list       — list your databases')
        console.log()
      } catch (err) {
        console.error(`\nLogin failed: ${err instanceof Error ? err.message : String(err)}`)
        process.exit(1)
      }
    })

  auth
    .command('logout')
    .description('Remove stored credentials')
    .action(() => {
      deleteConfig()
      console.log('Logged out.')
    })

  auth
    .command('whoami')
    .description('Show the currently authenticated user')
    .action(async () => {
      const config = getConfigOrExit()
      try {
        const res = await fetch(`${getBaseUrl()}/api/user/profile`, {
          headers: { Authorization: `Bearer ${config.token}` },
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const user = await res.json() as { email: string; plan: string; status: string; created_at: string }
        console.log(`Email:  ${user.email}`)
        console.log(`Plan:   ${user.plan}`)
        console.log(`Status: ${user.status}`)
        console.log(`Since:  ${new Date(user.created_at).toLocaleDateString()}`)
      } catch (err) {
        console.error(`Error: ${err instanceof Error ? err.message : String(err)}`)
        process.exit(1)
      }
    })
}

