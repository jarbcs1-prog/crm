# ADR 001: Synthetic Seed with healLegacyData for Demo Data and Member Promotion

Date: 2026-09-22
Status: Accepted

## Context

Seed originally used real owner identities (Ada Okafor, Marcus Lindqvist, Priya Raman) under earlier branding (COMP-AI / CRM). After rebranding to Shelf-Thought, Inc., stale deal names (`Comp AI`), workspace name (`CRM`), and owner records persisted across imported databases (including WAMP dumps). First real user (`jarbcs1@gmail.com`) also needed guaranteed owner promotion and removal of demo members.

## Decision

Implement deterministic synthetic seed (`packages/db/prisma/seed.ts`) with randomized but reproducible data (seeded PRNG) and a `healLegacyData()` pass that runs before seeding:

- Replace owners with synthetic identities (Sofia Delgado, Kenji Tanaka, Zara Al-Hassan).
- Heal legacy owners by name and email (reassign or merge into current owners).
- Rename stale deal names and workspace (`CRM` -> `Shelf-Thought`).
- Promote the real user to `owner` and demote other owners to `member`; remove demo members (`ada@trycomp.ai`, `marcus@trycomp.ai`, `priya@trycomp.ai`, `dev@localhost`, legacy shelf-thought addresses) and reassign their owned records.

## Alternatives

- Manual SQL migration scripts per dump — fragile, per-dump work.
- Wipe-and-reseed — destroys imported production data.
- Keep original identities — conflicts with rebrand and leaks demo data into member table.

## Consequences

- Seed is idempotent via upserts and safe to run against imported databases.
- Demo data never coexists with real users as owners.
- Healing logic must be updated if new legacy identities or branding strings appear.
