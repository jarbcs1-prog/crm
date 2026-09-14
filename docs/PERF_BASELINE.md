# PERF Baseline 2026-09-13

## Contacts list
- Queries per request: 6 (findMany + count + 4x groupBy in contacts.service.ts:120-144,555-587)
- Search: contains insensitive, no trigram index, sequential scan at scale
- Detail: 1 main + 5 parallel relationship + 1 isQueued in contacts.service.ts:229-239

## Import WAMP
- Existing suite: 14 pass in test/import-wamp.spec.ts
- Cost model: per-row mappedId + findUnique + create + markMapped awaited sequentially in import-wamp.ts:328,335,365,381,422,438,464
- Methods preload loads full contact table in import-wamp.ts:514-518

## Frontend
- contacts-table.tsx:138-139 fetches users.list + companies.options take 100 on every render

## Agent
- dispatch.ts:103-114 research lane capped at RESEARCH_CONCURRENCY 4 via runLimited (was unbounded Promise.all over RESEARCH_BATCH 12)

## Attempts
| Idea | Baseline -> Result | Verdict | Why |
| --- | --- | --- | --- |
| contactUpdateInput email/url parity | invalid accepted -> 3 new tests pass, full suite 136 pass | kept | closes dirty-write bypass, no behavior change for valid input |
| decideFact atomic updateMany | check-then-act -> row-count guard, suite green | kept | prevents concurrent double-accept |
| update empty-data guard | no-op write -> 400 Nothing to update | kept | fails fast on empty PATCH |
| import chunkArray + batchSize + verify chunks | manual slice -> shared helper, 19 pass in import specs | kept | behavior-preserving, enables batched callers |
| research lane runLimited(4) | unbounded 12 -> capped 4 | kept | matches visible-lane pattern; implemented 2026-09-14 |
| facetCounts 10s cache | 6 queries -> 2 on hit | kept | read-through TtlCache keyed by search term in contacts/companies/deals; implemented 2026-09-14 |
| pg_trgm migration | Seq Scan -> index (needs EXPLAIN on seeded DB) | kept, verify on staging | migration 20260914000000_pg_trgm_search_indexes added; not yet applied to live DB |
| transcript hostOf truncate | unbounded fallback -> 30 chars | kept | cosmetic safety |
| env whitelist:true strip-unknown | whitelist:false -> strip unknown, no throw | kept | forbidNonWhitelisted would break OS env, so strip-only |
| route.ts console.error -> Logger | reviewed | reverted | Next.js proxy has no Nest Logger; console is correct context |
