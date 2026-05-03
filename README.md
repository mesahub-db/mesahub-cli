# @mesahub/cli

Command-line tool for sqlite-hub. Manage your databases and API keys from the terminal.

## Installation

```bash
npm install -g @mesahub/cli
# or
pnpm add -g @mesahub/cli
```

## Authentication

Log in with your sqlite-hub account token (`shs_...`):

```bash
sqlite-hub auth login --token shs_your_token_here
```

Check who you're logged in as:

```bash
sqlite-hub auth whoami
```

Log out:

```bash
sqlite-hub auth logout
```

Credentials are stored in `~/.sqlite-hub/config.json` (mode `0600`).

## Commands

### Databases

```bash
# List all databases
sqlite-hub databases list

# Create a new database
sqlite-hub databases create my-app-db
sqlite-hub databases create my-app-db --display-name "My App DB" --description "Production database"

# Alias: db
sqlite-hub db list
```

### API Keys

```bash
# List all active API keys
sqlite-hub keys list

# Create a new API key (token shown once — save it!)
sqlite-hub keys create "my-app"

# Revoke a key by ID
sqlite-hub keys revoke <id>
```

## Custom Control Plane URL

If you're self-hosting, pass a custom base URL at login:

```bash
sqlite-hub auth login --token shs_... --base-url https://control.mycompany.com
```

The base URL is saved in `~/.sqlite-hub/config.json` and used for all subsequent commands.
