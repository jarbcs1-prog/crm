# ADR 003: Database Template vs Imported Data Separation

Date: 2026-09-22
Status: Accepted

## Context

The repo needs a reproducible empty template for new environments while supporting WAMP-imported production dumps for development. Committing full SQL dumps would bloat the repo and leak data.

## Decision

- Git-track only schema and migrations: `packages/db/prisma/schema.prisma` and `packages/db/prisma/migrations/**/*.sql` (explicit `!` exception in `.gitignore`).
- Gitignore imported data: `sql_dump/` directory and top-level `*.sql` files.
- Seed provides synthetic data; real data enters only via local `sql_dump` imports, healed at seed time by `healLegacyData()`.

## Alternatives

- Commit dumps — repo bloat, sensitive data exposure.
- No gitignore exception for migrations — migrations would be ignored as `*.sql`.
- Separate data repo — extra sync overhead for a single-team project.

## Consequences

- Fresh clones start from migrations + seed; no dump required.
- Local dumps remain untracked and must be managed outside version control.
- `.gitignore` ordering matters: generic `*.sql` ignore must precede migration exception.
