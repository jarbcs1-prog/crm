# CRM — No-Docker Installation Guide

**Version:** 1.0.0-nodocker  
**Date:** 2026-08-24  
**Target:** Windows, Linux, macOS  

This guide covers installing and running the CRM without Docker. The original repository included a `docker-compose.yml` for a Docker-based PostgreSQL setup. This version removes that requirement and works with any PostgreSQL database you provide.
---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [PostgreSQL Setup](#postgres-setup)
   - [Windows](#postgres-windows)
   - [Linux (Ubuntu/Debian)](#postgres-linux-ubuntu-debian)
   - [Linux (Fedora/RHEL/CentOS)](#postgres-linux-fedora-rhel-centos)
   - [Linux (Arch Linux)](#postgres-linux-arch)
   - [macOS (Homebrew)](#postgres-macos-homebrew)
   - [Using an Existing/Remote PostgreSQL](#postgres-existing-remote)
3. [Installing the CRM](#installing-the-crm)
4. [Configuration](#configuration)
5. [OAuth Setup (Google)](#oauth-setup-google)
6. [Running the CRM](#running-the-crm)
7. [Verification](#verification)
8. [Troubleshooting](#troubleshooting)
9. [Credential Handling](#credential-handling)
---

## Prerequisites

| Requirement | Minimum version | Notes |
|-------------|-----------------|-------|
| Bun | 1.3.12 | The project is pinned to `bun@1.3.12` in `package.json`. Use the version specified. |
| PostgreSQL | 17 or 18 | 17 or 18 recommended. Older versions may work but are untested. |
| Node.js | 22 | Required by some dependencies. Bun bundles its own; this is for native modules. |
| Git | Any recent version | For cloning the repository. |

### Installing Bun

Bun is the package manager and runtime for this project.

**Windows:**

```powershell
# Using Winget (Windows Package Manager)
winget install Bun.Bun

# Or using Scoop
scoop install bun

# Or manually: download from https://bun.sh
```

After installing, reopen your terminal and verify:

```powershell
bun --version
```

**Linux:**

```bash
# Using the official installer (recommended)
curl -fsSL https://bun.sh/install | bash

# Or using npm (if Node is already installed)
npm install -g bun

# For Ubuntu/Debian with apt
sudo apt update
sudo apt install bun

# For Fedora/RHEL
sudo dnf install bun
```

Verify:

```bash
bun --version
```

**macOS:**

```bash
# Using Homebrew
brew install bun

# Or using the official installer
curl -fsSL https://bun.sh/install | bash
```

Verify:

```bash
bun --version
```
---

## Postgres Setup

The CRM requires a PostgreSQL database. You can either install PostgreSQL locally on your machine or use an existing/remote PostgreSQL instance. Choose the path that matches your situation.

### Postgres Windows

#### Option A: PostgreSQL is already installed (recommended if you have it)

If PostgreSQL 17 or 18 is already installed (e.g. at `C:\PostgreSQL\18`), skip to **"Creating the database"** below.

To check if PostgreSQL is already installed and running:

```powershell
# Check if the PostgreSQL service is running
Get-Service -Name "postgresql*" -ErrorAction SilentlyContinue | Select-Object Name, Status

# Or check for the postgres process
Get-Process postgres -ErrorAction SilentlyContinue
```

If the service exists but is stopped:

```powershell
Start-Service -Name "postgresql-x64-18"   # Adjust version number as needed
```

#### Option B: Install PostgreSQL on Windows

1. Download the installer from the [PostgreSQL downloads page](https://www.postgresql.org/download/windows/). Use the EnterpriseDB installer for PostgreSQL 17 or 18.

2. Run the installer. During setup:
   - **Install components:** Select "PostgreSQL Server", "pgAdmin 4", "Stack Builder" (optional).
   - **Data directory:** Default is `C:\Program Files\PostgreSQL\18\data`.
   - **Password:** Set a password for the `postgres` superuser. **Record this password.**
   - **Port:** Default is 5432. Use the default unless you have a conflict.
   - **Locale:** Default is fine.

3. After installation, the PostgreSQL service should start automatically. Verify:

   ```powershell
   Get-Service -Name "postgresql-x64-18" | Select-Object Name, Status
   ```

   If the service name differs, check with:

   ```powershell
   Get-Service | Where-Object { $_.DisplayName -like "*PostgreSQL*" }
   ```

#### Creating the database (all Windows paths)

The CRM expects a database named `crm`. Create it using `psql`:

```powershell
# Using the Windows PostgreSQL bin directory
& "C:\PostgreSQL\18\bin\psql.exe" -U postgres -h localhost -c "CREATE DATABASE crm;"
```

You will be prompted for the `postgres` user's password.

If the database already exists, you will get an error. That's fine — skip to **Configuring the connection** below.

If you want to use a different database name, change `crm` to your preferred name and adjust `DATABASE_URL` accordingly.

#### Configuring the connection (Windows)

Edit the `.env` file and set `DATABASE_URL` to point at your local PostgreSQL:

```
DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/crm?schema=public"
```

Replace `YOUR_PASSWORD` with the password you set for the `postgres` user (or the password of whatever role you choose to use).

If your PostgreSQL is on a different port, change `5432` to the actual port.

If your PostgreSQL requires SSL, add `?sslmode=require` (or the appropriate setting) to the connection string.

#### Verifying the connection (Windows)

Test that the connection works:

```powershell
$env:DATABASE_URL = "postgresql://postgres:POSTGRE2026sql!@localhost:5432/crm?schema=public"
& "C:\PostgreSQL\18\bin\psql.exe" -U postgres -h localhost -d crm -c "SELECT version();"
```

If you see a version string, the connection is working.
---

### Postgres Linux (Ubuntu/Debian)

#### Installing PostgreSQL

```bash
sudo apt update
sudo apt install postgresql postgresql-contrib libpq-dev
```

This installs PostgreSQL and the development libraries needed by some clients.

Check the installed version:

```bash
psql --version
```

#### Starting and enabling the service

```bash
sudo systemctl enable postgresql
sudo systemctl start postgresql
sudo systemctl status postgresql
```

#### Creating the database

The PostgreSQL installer on Ubuntu/Debian creates a system user named `postgres`. Switch to that user and create the `crm` database:

```bash
sudo -u postgres psql -c "CREATE DATABASE crm;"
```

If the database already exists, you'll get an error. That's fine.

If you want a dedicated role (recommended for production):

```bash
# Create a new role with a password
sudo -u postgres psql -c "CREATE ROLE crmuser WITH LOGIN PASSWORD 'your_secure_password';"

# Grant the role ownership of the crm database
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE crm TO crmuser;"
```

#### Configuring the connection (Ubuntu/Debian)

Edit `.env` and set `DATABASE_URL`:

```
DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/crm?schema=public"
```

If you created a dedicated role, use that instead:

```
DATABASE_URL="postgresql://crmuser:your_secure_password@localhost:5432/crm?schema=public"
```

#### Verifying the connection (Ubuntu/Debian)

```bash
psql -U postgres -h localhost -d crm -c "SELECT version();"
```

You will be prompted for the password. If you see a version string, you're connected.
---

### Postgres Linux (Fedora/RHEL/CentOS)

#### Installing PostgreSQL

**Fedora:**

```bash
sudo dnf install postgresql postgresql-server postgresql-contrib libpq-devel
```

**RHEL/CentOS 8+:**

```bash
sudo dnf install -y postgresql-server postgresql-contrib libpq-devel
```

**CentOS 7:**

```bash
sudo yum install postgresql-server postgresql-contrib libpq-devel
```

#### Initializing and starting the service

**Fedora/RHEL/CentOS 8+:**

```bash
# Initialize the database
sudo postgresql-setup --initdb

# Enable and start
sudo systemctl enable postgresql
sudo systemctl start postgresql
sudo systemctl status postgresql
```

**CentOS 7:**

```bash
# Initialize
sudo postgresql-setup initdb

# Enable and start
sudo systemctl enable postgresql
sudo systemctl start postgresql
sudo systemctl status postgresql
```

#### Creating the database

```bash
sudo -u postgres psql -c "CREATE DATABASE crm;"
```

For a dedicated role:

```bash
sudo -u postgres psql -c "CREATE ROLE crmuser WITH LOGIN PASSWORD 'your_secure_password';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE crm TO crmuser;"
```

#### Configuring the connection

Same as Ubuntu/Debian. Set `DATABASE_URL` in `.env`:

```
DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/crm?schema=public"
```

#### Verifying the connection

```bash
psql -U postgres -h localhost -d crm -c "SELECT version();"
```
---

### Postgres Linux (Arch Linux)

#### Installing PostgreSQL

```bash
sudo pacman -S postgresql postgresql-contrib libpq
```

#### Initializing and starting the service

```bash
# Initialize the database cluster
sudo postgresql-init

# Enable and start
sudo systemctl enable postgresql
sudo systemctl start postgresql
sudo systemctl status postgresql
```

#### Creating the database

```bash
sudo -u postgres psql -c "CREATE DATABASE crm;"
```

For a dedicated role:

```bash
sudo -u postgres psql -c "CREATE ROLE crmuser WITH LOGIN PASSWORD 'your_secure_password';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE crm TO crmuser;"
```

#### Configuring the connection

Same pattern. Set `DATABASE_URL` in `.env`:

```
DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/crm?schema=public"
```

#### Verifying the connection

```bash
psql -U postgres -h localhost -d crm -c "SELECT version();"
```
---

### Postgres macOS (Homebrew)

#### Installing PostgreSQL

```bash
# Install PostgreSQL 17 or 18
brew install postgresql@17     # or postgresql@18
```

Homebrew installs PostgreSQL but does not automatically start the service or create the default
database.

#### Starting the service

For `postgresql@17`:

```bash
brew services start postgresql@17
```

For `postgresql@18`:

```bash
brew services start postgresql@18
```

#### Creating the database

Homebrew's PostgreSQL installation creates a `postgres` role without a password by default, using
peer authentication for local connections. Create the `crm` database:

```bash
# Connect as the postgres user (peer auth, no password needed for local connections)
createdb -U postgres crm
```

Or using `psql`:

```bash
psql -U postgres -c "CREATE DATABASE crm;"
```

For a dedicated role with a password:

```bash
psql -U postgres -c "CREATE ROLE crmuser WITH LOGIN PASSWORD 'your_secure_password';"
psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE crm TO crmuser;"
```

#### Configuring the connection (macOS)

Edit `.env` and set `DATABASE_URL`:

```
DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/crm?schema=public"
```

If you're using peer authentication (no password), you may need to adjust `pg_hba.conf` to allow
password authentication for local TCP connections or use a dedicated role with a password.

The default `pg_hba.conf` location for Homebrew PostgreSQL is:

```
/opt/homebrew/var/postgresql@17/pg_hba.conf   # Apple Silicon
/usr/local/var/postgresql@17/pg_hba.conf      # Intel
```

For password authentication over TCP, ensure there's a line like:

```
host    all             all             127.0.0.1/32            scram-sha-256
```

After editing `pg_hba.conf`, restart the service:

```bash
brew services restart postgresql@17
```

#### Verifying the connection (macOS)

```bash
psql -U postgres -h localhost -d crm -c "SELECT version();"
```
---

### Postgres: Using an Existing/Remote PostgreSQL

If you already have a PostgreSQL database running elsewhere (a managed database service, a colleague's server, a Virtual Private Server, etc.), you can use it directly. You do not need to install PostgreSQL locally.

#### Requirements

- The database server must be reachable from your machine (network-wise).
- You need a user account with permissions to create tables (or at least to connect and run the migrations that the CRM requires).
- The database should be running PostgreSQL 17 or 18. Older versions may work but are untested.
- If the database is remote, ensure your firewall allows connections from your machine to the database port (default 5432).

#### Creating the database (if it doesn't exist)

If you have a database but it's not named `crm`, you have two options:

**Option 1:** Create a `crm` database on the existing server (if you have permissions):

```bash
psql -h HOST -U USERNAME -d EXISTING_DB -c "CREATE DATABASE crm;"
```

Replace `HOST`, `USERNAME` and `EXISTING_DB` with your actual values.

**Option 2:** Use an existing database and adjust `DATABASE_URL`:

If you don't have permission to create a new database, use an existing one and change the path in
`DATABASE_URL`. For example, if your database is called `myapp`:

```
DATABASE_URL="postgresql://user:password@host:5432/myapp?schema=public"
```

You will also need to adjust the seed expectations — the CRM seed assumes certain tables exist. Running `bun run db:deploy` will create the schema regardless of the database name.

#### Configuring the connection

Set `DATABASE_URL` in `.env`:

```
DATABASE_URL="postgresql://USERNAME:PASSWORD@HOST:PORT/crm?schema=public"
```

Replace:
- `USERNAME` — your database user
- `PASSWORD` — that user's password
- `HOST` — the database server's hostname or IP address
- `PORT` — the port (usually 5432)
- `crm` — the database name (or your existing database name)

If the database requires SSL:

```
DATABASE_URL="postgresql://USERNAME:PASSWORD@HOST:PORT/crm?schema=public&sslmode=require"
```

Other SSL modes: `disable`, `allow`, `prefer`, `require`, `verify-ca`, `verify-full`. Use `require` if you need encryption but don't have certificate verification set up. Use `verify-full` for production with proper certificates.

#### Verifying the connection

```bash
psql -h HOST -U USERNAME -d crm -c "SELECT version();"
```

Enter your password when prompted. If you see a version string, the connection works.

#### Firewall and security notes

- **Do not expose your PostgreSQL port to the public internet** unless you have a specific reason and have configured authentication and encryption appropriately.
- Use a firewall to restrict access to the PostgreSQL port to known IP addresses.
- Use strong passwords for database roles.
- Consider using SSH tunneling if you need to connect to a remote database securely:

  ```bash
  # SSH tunnel: forward local port 5433 to remote host's port 5432
  ssh -L 5433:localhost:5432 user@remote-host

  # Then connect locally:
  psql -h localhost -p 5433 -U USERNAME -d crm
  ```
In this case, set `DATABASE_URL` to use `localhost:5433`.
---

## Installing the CRM

Once PostgreSQL is set up and reachable, install the CRM application.

### Step 1: Clone the repository

```bash
git clone https://github.com/YOUR_USERNAME/crm.git
cd crm
```

Replace `YOUR_USERNAME` with your GitHub username or the repository owner's name.

### Step 2: Install dependencies

```bash
bun install
```

This reads `package.json` and `bun.lock` and installs all dependencies into `node_modules/`.

If you get errors about Bun version, check the required version in `package.json`:

```json
"devEngines": {
  "packageManager": {
    "name": "bun",
    "version": "1.3.12"
  }
}
```

Use `bun upgrade` to get the latest version or install the specific version if needed.

### Step 3: Configure environment variables

Copy the example environment file and edit it:

```bash
cp .env.example .env
```

Now edit `.env` with your actual values. See [Configuration](#configuration) below for details.

**Important:** `.env` should **never** be committed to Git. It is already listed in `.gitignore`.
Only `.env.example` is committed — and that file contains placeholder values, not real secrets.
---

## Configuration

### Required variables

The CRM needs the following variables to start. Everything else is optional.

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | **Yes** | Connection string for your PostgreSQL database. |
| `BETTER_AUTH_SECRET` | **Yes** | Secret key for session signing. Generate with `openssl rand -base64 32`. |
| `ALLOWED_SIGN_IN` | **Yes** | Email domain or address that is allowed to sign in. |
| `GOOGLE_CLIENT_ID` | No* | Google OAuth client ID. Required for Google sign-in and mail sync. |
| `GOOGLE_CLIENT_SECRET` | No* | Google OAuth client secret. Required for Google sign-in and mail sync. |

\* If you leave both `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` empty, the app will start but Google sign-in and mailbox sync will be disabled. You can add them later.

### Database connection (`DATABASE_URL`)

The format is a standard PostgreSQL connection string:

```
DATABASE_URL="postgresql://USERNAME:PASSWORD@HOST:PORT/DATABASE?schema=public"
```

**Components:**

| Component | Example | Notes |
|-----------|---------|-------|
| `USERNAME` | `postgres` | The database user. Use `postgres` for local development, a dedicated role for production. |
| `PASSWORD` | `your_password` | The user's password. Never commit this to Git. |
| `HOST` | `localhost` or `192.168.1.100` | The database server. Use `localhost` for a local install. |
| `PORT` | `5432` | The PostgreSQL port. Default is 5432. |
| `DATABASE` | `crm` | The database name. Must exist before running migrations. |
| `schema=public` | — | The Postgres schema. `public` is the default. |

**Examples:**

Local PostgreSQL on Windows (password `postgres`):
```
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/crm?schema=public"
```

Local PostgreSQL on Linux with dedicated role:
```
DATABASE_URL="postgresql://crmuser securepassword123@localhost:5432/crm?schema=public"
```

Remote PostgreSQL (e.g. a managed service):
```
DATABASE_URL="postgresql://crmuser s3cur3p@ssw0rd@db.example.com:5432/crm?schema=public"
```

With SSL required:
```
DATABASE_URL="postgresql://crmuser s3cur3p@ssw0rd@db.example.com:5432/crm?schema=public&sslmode=require"
```

**Generating `BETTER_AUTH_SECRET`:**

```bash
openssl rand -base64 32
```

Copy the output into `.env`:

```
BETTER_AUTH_SECRET="your_generated_secret_here"
```

On Windows (PowerShell):

```powershell
# Generate a random secret
$bytes = New-Object byte[] 32
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$rng.GetBytes($bytes)
[Convert]::ToBase64String($bytes)
```

**Setting `ALLOWED_SIGN_IN`:**

This is the entire authorization model. Only addresses matching this value can sign in.

```
# Everyone at your company
ALLOWED_SIGN_IN="acme.com"

# Everyone at your company plus one contractor
ALLOWED_SIGN_IN="acme.com,contractor@gmail.com"

# Single-person install
ALLOWED_SIGN_IN="you@gmail.com"
```

An empty value means nobody can sign in (fails closed).

### Optional variables

| Variable | Description |
|----------|-------------|
| `API_URL` | Where the API is served. Default: `http://localhost:3001`. Set for production. |
| `APP_URL` | Where the web app is served. Default: `http://localhost:3000`. Set for production. |
| `AUTH_COOKIE_DOMAIN` | Set to the parent domain if API and app are on different subdomains (e.g. `.example.com`). |
| `PERPLEXITY_API_KEY` | Enables web search for the agent. Get from [Perplexity](https://perplexity.ai/settings/api). |
| `RAPIDAPI_KEY` | Enables LinkedIn profile lookups. Get from [RapidAPI](https://rapidapi.com/linkdapi). |
| `CONTEXT_DEV_API_KEY` | Enables company logo/industry/social lookups. Get from [Context.dev](https://context.dev). |
| `GITHUB_TOKEN` | Raises rate limits when matching contacts to GitHub profiles. Any classic token works. |
| `AGENT_BRIDGE_SECRET` | Enables the Agent tab on contact/company/deal pages. Generate with `openssl rand -base64 32`. Set the same value for both the app and the agent. |
| `REDIS_URL` | Shared cache. Without it, per-instance and in-memory caching is used. |
| `CRON_SECRET` | Guards the Gmail/Calendar sync route. Required to use the sync. Generate with `openssl rand -base64 32`. |
| `PORT` | API port. Default: `3001`. |
---

## OAuth Setup (Google)

The CRM uses Google for sign-in and for Gmail/Calendar access. Setting up Google OAuth takes about 2 minutes.

### Step 1: Create a Google Cloud project

1. Go to [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project (or select an existing one).

### Step 2: Create OAuth credentials

1. In the Google Cloud Console, go to **APIs & Services** → **Credentials**.
2. Click **Create Credentials** → **OAuth client ID**.
3. Select **Web application** as the application type.
4. Give it a name (e.g. "CRM Local Development").
5. Under **Authorized redirect URIs**, add:
   - `http://localhost:3001/api/auth/callback/google` (for local development)
   - Your production redirect URI if deploying (e.g. `https://app.example.com/api/auth/callback/google`)
6. Click **Create**.
7. Copy the **Client ID** and **Client Secret**.

### Step 3: Enable required APIs

1. In the Google Cloud Console, go to **APIs & Services** → **Library**.
2. Search for and enable:
   - **Gmail API** (`gmail.googleapis.com`)
   - **Google Calendar API** (`calendar-json.googleapis.com`)

### Step 4: Configure the CRM

Add the credentials to `.env`:

```
GOOGLE_CLIENT_ID="your_client_id_here"
GOOGLE_CLIENT_SECRET="your_client_secret_here"
```

### Step 5: Workspace domains (optional)

If your Google account is on a Workspace domain, set the OAuth consent screen to **Internal** so only users in your organization can see the consent prompt.
---

## Running the CRM

### Starting all services

From the root of the repository:

```bash
bun run dev
```

This starts:
- **Next.js app** on `http://localhost:3000`
- **NestJS API** on `http://localhost:3001`
- **Eve agent** on `http://127.0.0.1:2000`

Wait for all three to report ready. The API logs should show a database connection.

### Starting individual services

You can scope the `dev` command with Turborepo filters:

```bash
# Start only the API
bun run dev --filter=api

# Start only the app
bun run dev --filter=app

# Start only the agent
bun run dev --filter=agent
```

### Running the build

To build all apps for production:

```bash
bun run build
```

### Applying database migrations

```bash
bun run db:deploy
```

This applies any pending migrations to the database specified in `DATABASE_URL`.

### Seeding demo data

```bash
bun run db:seed
```

This populates the database with a believable demo pipeline (companies, contacts, deals, activities).
It is idempotent — running it multiple times does not duplicate data.
---

## Verification

After starting the CRM, verify each service is healthy.

### 1. Check the app

Open `http://localhost:3000` in a browser. You should see the CRM login page.

### 2. Check the API

```bash
curl http://localhost:3001/health
```

Or check the API logs for a line like:

```
Database connected
```

### 3. Check the agent

```bash
curl http://127.0.0.1:2000/health
```

Or check the agent logs for:

```
[agent] on   LinkedIn (RAPIDAPI_KEY)
[agent] off  Web research (PERPLEXITY_API_KEY)
```

(The actual keys listed will depend on what you configured.)

### 4. Verify the database

Connect directly to the database and check that the migrations were applied:

```bash
psql -h HOST -U USERNAME -d crm -c "\dt"
```

You should see tables like `user`, `company`, `contact`, `deal`, `activity`, etc.
---

## Troubleshooting

### Port already in use

If one of the services fails to start because the port is in use:

**Windows:**

```powershell
# Find the process using port 3000
netstat -ano | findstr :3000

# Kill the process (replace PID with the actual process ID)
taskkill /PID PID /F
```

**Linux/macOS:**

```bash
# Find the process using port 3000
lsof -i :3000

# Kill the process
kill -9 PID
```

### Database connection fails

- Check that PostgreSQL is running:
  - Windows: `Get-Service postgresql*` or check Services
  - Linux: `systemctl status postgresql`
  - macOS: `brew services list | grep postgres`
- Check that the database `crm` exists: `psql -l` or `SHOW DATABASES;`
- Check that `DATABASE_URL` in `.env` is correct (user, password, host, port, database name)
- Check that the user has permission to connect to the database
- If using SSL, ensure the SSL mode in `DATABASE_URL` matches the server configuration

### `bun install` fails

- Ensure you have the correct Bun version (1.3.12 per `package.json`)
- Clear the lockfile and reinstall: `rm bun.lock && bun install`
- Check that Node.js 22 is available (some packages may require it)

### Google sign-in fails

- Verify `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set in `.env`
- Verify the redirect URI in Google Cloud Console matches `http://localhost:3001/api/auth/callback/google`
- Verify the Gmail and Calendar APIs are enabled in Google Cloud Console
- Check the browser's developer console for error details

### Agent tab not showing

- Ensure `AGENT_BRIDGE_SECRET` is set to the same value in both the app and agent configurations
- Check that the agent is running on port 2000
- Refresh the page after the agent starts
---

## Credential Handling

### Rules

1. **Never commit `.env` to Git.** It is already in `.gitignore`. Only `.env.example` is committed and it contains placeholders.
2. **Never hardcode passwords or tokens in code.** Use environment variables.
3. **Use strong, unique passwords** for database roles and OAuth clients.
4. **Rotate secrets periodically.** If a secret is compromised, change it immediately and restart the affected services.

### What to put in `.env`

```
# Required
DATABASE_URL="postgresql://user:password@host:5432/crm?schema=public"
BETTER_AUTH_SECRET="generated_with_openssl_rand_base64_32"
ALLOWED_SIGN_IN="yourdomain.com"

# Google OAuth (both or neither)
GOOGLE_CLIENT_ID="your_client_id"
GOOGLE_CLIENT_SECRET="your_client_secret"

# Optional
PERPLEXITY_API_KEY=""
RAPIDAPI_KEY=""
CONTEXT_DEV_API_KEY=""
GITHUB_TOKEN=""
AGENT_BRIDGE_SECRET=""
CRON_SECRET=""
```

### What NOT to put in `.env.example`

`.env.example` is committed to Git. It should contain only placeholder values:

```
DATABASE_URL="postgresql://postgres:***@localhost:5432/crm?schema=public"
BETTER_AUTH_SECRET=""
ALLOWED_SIGN_IN=""
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""
```

The `***` in the `DATABASE_URL` password is a signal that the password must be filled in. `BETTER_AUTH_SECRET` ships empty on purpose — generate your own with `openssl rand -base64 32` and never reuse a value that appears in this repository.
---

## Next Steps

Once the CRM is running:

1. **Sign in** with a Google account that matches `ALLOWED_SIGN_IN`.
2. **Add a company** to see how the agent enriches it (if you have API keys configured).
3. **Configure the agent** by setting `AGENT_BRIDGE_SECRET` to enable the Agent tab on records.
4. **Set up the mailbox sync** by configuring `CRON_SECRET` and pointing a scheduler at `POST /internal/sync/google`.

For more details on the agent, see [`docs/agent.md`](./docs/agent.md).
For API documentation, see [`docs/api.md`](./docs/api.md).
For the security model, see [`SECURITY.md`](./SECURITY.md).
---

*End of installation guide.*
