# MesaHub CLI

Command-line tool for MesaHub. Manage databases, run SQL, and handle API keys from the terminal.

## Installation

```bash
npm install -g @mesahub/cli
# or
pnpm add -g @mesahub/cli
```

Requires Node.js 18+.

## Authentication

```bash
mesahub auth login
```

Opens a browser window to your MesaHub dashboard. After you approve, a session token is written to `~/.config/mesahub/config.json`. Your plan limits and API URL are stored automatically — dedicated instance users get their instance URL, shared users get the default.

For a self-hosted instance:

```bash
mesahub auth login --base-url https://manage.mycompany.com
```

Verify who you're logged in as:

```bash
mesahub auth whoami
```

Log out (deletes the local config file):

```bash
mesahub auth logout
```

---

## Commands

### Databases (`databases` / `db`)

```bash
# List all databases (* marks the active one)
mesahub db list

# Create a new database
mesahub db create my-app-db
mesahub db create analytics --description "Production analytics"

# Set the active database (used by default for query/exec)
mesahub db use my-app-db

# Run a read-only query (SELECT, WITH, PRAGMA, EXPLAIN)
mesahub db query --sql "SELECT * FROM users LIMIT 10"
mesahub db query analytics --sql "SELECT count(*) FROM events"

# Run a write statement (INSERT, UPDATE, DELETE, CREATE, ALTER, DROP)
mesahub db exec --sql "INSERT INTO events (type) VALUES ('deploy')"
mesahub db exec my-app-db --sql "DELETE FROM sessions WHERE expired = 1"

# Rename a database
mesahub db rename my-app-db my-app-db-v2

# Delete a database (prompts for confirmation)
mesahub db delete my-app-db
mesahub db delete my-app-db --force
```

#### Plan limits

`db create` pre-checks your plan limit before calling the API. If the cap is reached:

```
Database limit reached: your free plan allows 2 databases.
Upgrade at https://mesahub.app/pricing
```

Limits are captured at login time — run `mesahub auth login` again after upgrading your plan.

---

### Buckets (`buckets`)

Buckets are enabled on plans that include file storage.

```bash
mesahub buckets list
mesahub buckets create uploads
mesahub buckets create uploads --description "User file uploads"
mesahub buckets rename uploads assets
mesahub buckets delete uploads           # prompts for confirmation
mesahub buckets delete uploads --force
```

---

### API Keys (`keys`)

```bash
# List all active API keys
mesahub keys list

# Create a new key — token shown once, save it immediately
mesahub keys create ci-deploy

# Revoke a key by ID
mesahub keys revoke 01abc123-dead-beef-0000-000000000001
```

---

## Config file

Stored at `~/.config/mesahub/config.json` (or `$XDG_CONFIG_HOME/mesahub/config.json`). Created with mode `0600` — readable only by your user.

```json
{
  "token":        "shs_your_session_token",
  "baseUrl":      "https://www.mesahub.app",
  "apiUrl":       "https://api.mesahub.app",
  "activeDb":     "01abc123-...",
  "plan":         "free",
  "maxDatabases": 2
}
```

`plan` and `maxDatabases` are written at login and used for pre-flight limit checks. Dedicated instance users will see their instance URL in `apiUrl`. Run `mesahub auth login` to refresh all fields after a plan change.

Delete this file manually or run `mesahub auth logout` to remove it.
