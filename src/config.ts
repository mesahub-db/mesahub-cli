import { homedir } from 'os'
import { join } from 'path'
import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from 'fs'

// XDG Base Directory: $XDG_CONFIG_HOME/sqlite-hub, falling back to ~/.config/sqlite-hub
const XDG_CONFIG_HOME = process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config')
const CONFIG_DIR  = join(XDG_CONFIG_HOME, 'mesahub')
const CONFIG_FILE = join(CONFIG_DIR, 'config.json')

export interface Config {
  token: string
  baseUrl: string
  /** Template / data-plane URL for query, exec, and file operations. Defaults to baseUrl. */
  apiUrl?: string
  /** Slug/ref of the currently active database (used when no ref is passed to query/exec). */
  activeDb?: string
}

const DEFAULT_BASE_URL = 'https://www.mesahub.app'

function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 })
  }
}

export function readConfig(): Config | null {
  try {
    if (!existsSync(CONFIG_FILE)) return null
    const raw = readFileSync(CONFIG_FILE, 'utf-8')
    return JSON.parse(raw) as Config
  } catch {
    return null
  }
}

export function writeConfig(config: Config): void {
  ensureConfigDir()
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), { mode: 0o600 })
}

export function deleteConfig(): void {
  if (existsSync(CONFIG_FILE)) {
    unlinkSync(CONFIG_FILE)
  }
}

export function getConfigOrExit(): Config {
  const config = readConfig()
  if (!config?.token) {
    console.error('Not authenticated. Run: sqlite-hub auth login')
    process.exit(1)
  }
  return config
}

export function setActiveDb(slug: string): void {
  const config = readConfig()
  if (!config) {
    console.error('Not authenticated. Run: sqlite-hub auth login')
    process.exit(1)
  }
  writeConfig({ ...config, activeDb: slug })
}

export function getActiveDb(): string | undefined {
  return readConfig()?.activeDb
}

export function getBaseUrl(override?: string): string {
  return override ?? readConfig()?.baseUrl ?? DEFAULT_BASE_URL
}

export function getApiUrl(override?: string): string {
  const config = readConfig()
  return override ?? config?.apiUrl ?? config?.baseUrl ?? DEFAULT_BASE_URL
}
