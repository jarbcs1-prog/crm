# ADR 002: Better-Auth Provider Catalog and @better-auth/cli 1.4.22 Pin

Date: 2026-09-22
Status: Accepted

## Context

Settings must expose all 7 local auth providers and a relaxed model filter. Better-auth core and `@better-auth/sso` are on 1.6.x/1.7.x, but `@better-auth/cli` has no 1.6.x or 1.7.x tag — bumping it to `1.6.26` broke `bun install` and schema generation (`better-auth generate`).

## Decision

- Keep `better-auth` and `@better-auth/sso` on the 1.6.x/1.7.x line.
- Pin `@better-auth/cli` to `1.4.22` in `packages/auth/package.json` and commit the corresponding `bun.lock` resolution.
- Document that CLI versioning is independent of core; upgrades require verifying tag existence on npm before bumping.

## Alternatives

- Upgrade CLI to match core — fails: tag does not exist.
- Remove CLI and hand-edit `schema.prisma` — loses generated auth tables and drift protection.
- Vendor a custom CLI fork — unnecessary maintenance burden.

## Consequences

- `auth:generate` remains functional while core features stay current.
- Renovate/Dependabot bumps to `@better-auth/cli` must be manually vetted or ignored via package rule.
- Future CLI releases may allow re-alignment; ADR should be revisited when a matching tag appears.
