# Installation

## Prerequisites

- **Bun** >= 1.1 (also provides Node 20+)
- **Postgres** 15+ (local install, Docker, or hosted like Neon/Supabase)
- Git

## Clone and env

```sh
git clone https://github.com/jarbcs1-prog/crm.git && cd crm
cp .env.example .env
```

Edit `.env` — only four values are required:

| Variable | Value |
|---|---|
| `DATABASE_URL` | `postgresql://user:password@localhost:5432/crm?schema=public` |
| `BETTER_AUTH_SECRET` | `openssl rand -base64 32` |
| `ALLOWED_SIGN_IN` | your domain e.g. `acme.com` or `you@gmail.com` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth client (both or neither) |

See `docs/environment.md` for every variable.

## Database

Create the database first (if local):

```sh
createdb crm
# or: psql -c "CREATE DATABASE crm;"
```

Then:

```sh
bun install
bun run db:deploy   # apply migrations (no DB creation)
# or: bun run db:migrate  # create + apply migration (dev)
bun run db:seed     # optional: synthetic demo pipeline
```

`db:seed` is idempotent synthetic data only. `db:migrate`/`db:push` refuse non-local hosts unless `ALLOW_REMOTE_DB=1`.

## Run dev

```sh
bun run dev
```

App http://localhost:3000, API http://localhost:3001. The agent is at `AGENT_URL` (default http://127.0.0.1:2000) — optional.

## Production (Vercel)

Three deployments sharing `DATABASE_URL` + `BETTER_AUTH_SECRET`: Next.js app, NestJS API, agent. Set `API_URL`/`APP_URL` to real origins, `AUTH_COOKIE_DOMAIN` if on subdomains, and add `https://your-api-host/api/auth/callback/google` to OAuth redirect URIs. Set `CRON_SECRET` and point scheduler at `POST /internal/sync/google`.

## Legacy import

If migrating from the old WAMP CRM dump:

```sh
# set in .env:
LEGACY_CRM_SQL_PATH="/path/to/legacy-crm-dump.sql"
bun run --filter=api import:wamp
```

Without the variable the command exits with a clear error.
