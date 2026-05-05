# MesaHub CLI

Command-line tool for MesaHub. Manage your databases and API keys from the terminal.

## Installation

```bash
npm install -g @mesahub/cli
# or
pnpm add -g @mesahub/cli
```

## Authentication

### Method 1 — Connection string

Pass a `mh://` URL directly to any command using `--url`:

```bash
mesahub --url "mh://shs_your_api_key@your-core.railway.app/my-app-db" db query "SELECT * FROM users"
```

Or export it as an environment variable — any command will pick it up automatically:

```bash
export MESAHUB_URL="mh://shs_your_api_key@your-core.railway.app/my-app-db"
mesahub db query "SELECT * FROM users"
```

Connection string format: `mh://apikey@host[:port]/dbname`

```
# Hosted / remote  →  HTTPS
mh://shs_abc123@my-core.railway.app/my-app-db

# Local / Docker   →  HTTP (detected automatically from hostname)
mh://shs_abc123@localhost:3000/my-app-db
mh://shs_abc123@core-service/my-app-db
```

### Method 2 — Login (saved credentials)

Log in once with your API key and control plane URL:

```bash
mesahub auth login --token shs_your_token_here
```

For a self-hosted instance, pass your control plane URL:

```bash
mesahub auth login --token shs_... --base-url https://control.mycompany.com
```

Credentials are saved to `~/.config/mesahub/config.json` (mode `0600`) and used for all subsequent commands.

Check who you're logged in as:

```bash
mesahub auth whoami
```

Log out:

```bash
mesahub auth logout
```

## Commands

### Databases

```bash
# List all databases
mesahub databases list

# Create a new database
mesahub databases create my-app-db
mesahub databases create my-app-db --display-name "My App DB" --description "Production database"

# Alias: db
mesahub db list
```

### API Keys

```bash
# List all active API keys
mesahub keys list

# Create a new API key (token shown once — save it!)
mesahub keys create "my-app"

# Revoke a key by ID
mesahub keys revoke <id>
```
