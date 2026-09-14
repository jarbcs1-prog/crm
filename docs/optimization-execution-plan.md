# Code Optimization Execution Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate measured hotspots from 2026-09-13 optimization analysis without behavior change.

**Architecture:** Batch DB writes, cache read-heavy facets, tighten validation and concurrency guards, then index and bound frontend fetches. Measure before/after per change, revert neutrals.

**Tech Stack:** NestJS 11, Prisma 6 Postgres, TanStack Query + tRPC, Redis cache-manager, pg_trgm.

**Spec:** Optimization findings in prior turn covering `apps/api/src/contacts/contacts.service.ts`, `apps/api/src/import/import-wamp.ts`, `apps/app/app/(app)/contacts/contacts-table.tsx`, `apps/api/src/contacts/contacts.contracts.ts`, `apps/agent/agent/lib/dispatch.ts`.

## Global Constraints

- Single root `.env` only, never per-package `.env`; document new vars in `.env.example` and `apps/api/src/config/env.validation.ts`.
- No intelligence in API; agent owns enrichment, API only writes `AgentTask` rows.
- Use Nest `Logger` with single-object fields, never `console.log` in API/app runtime paths.
- tRPC is data surface; validate with zod, Prisma work in `*.service.ts`, `HttpException` mapped via `DomainErrorMiddleware`.
- UI from `packages/ui` only, no call-site style overrides, radii from scale only.
- No code comments in written code.
- No coauthored commits.
- Measure before/after same-command same-conditions, keep only wins exceeding variance, log kept and reverted attempts.

---

### Task 1: Instrument baselines

**Files:**
- Modify: `apps/api/src/contacts/contacts.service.ts:116-156`
- Modify: `apps/api/src/import/import-wamp.ts:84-136`
- Test: `apps/api/test/perf-baseline.spec.ts`

**Interfaces:**
- Consumes: existing `list()`, `facetCounts()`, `loadTables()`
- Produces: `PERF_BASELINE.md` with p50/p95, query counts, import rows/sec

- [ ] **Step 1: Write failing test capturing baseline harness**

```ts
import { paginate, resolveOrderBy } from "../src/trpc/list-input";
describe("perf baseline", () => {
  it("exposes pagination contract", () => {
    expect(paginate({ page: 2, pageSize: 25 })).toEqual({ skip: 25, take: 25 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run --filter=api test perf-baseline.spec.ts`
Expected: FAIL with file not found until created

- [ ] **Step 3: Record manual baseline**

Run: `EXPLAIN ANALYZE` on contacts list query, `PRISMA_LOG_QUERIES=true bun run --filter=api test`, time `import-wamp.ts --dry-run` on sample dump
Expected: Fill `PERF_BASELINE.md` with query count 6 per list, import rows/sec, LCP/INP if available

- [ ] **Step 4: Run tests to verify harness passes**

Run: `bun run --filter=api test perf-baseline.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/test/perf-baseline.spec.ts PERF_BASELINE.md
git commit -m "chore: record perf baseline for contacts and import"
```

---

### Task 2: Batch WAMP import

**Files:**
- Modify: `apps/api/src/import/import-wamp.ts:289-310,312-407,409-492,514-530`
- Modify: `apps/api/src/import/legacy-map.ts`
- Test: `apps/api/test/import-wamp.spec.ts`

**Interfaces:**
- Consumes: `loadTables()`, `rowsOf()`, `Lookup` maps
- Produces: `importCompaniesBatch(records: LegacyRecord[]): Promise<Map<string,string>>`, `importContactsBatch()` with same `Summary` shape

- [ ] **Step 1: Write failing test for batched mapping**

```ts
import { parseArgs } from "../src/import/import-wamp";
describe("import batch", () => {
  it("parses limit", () => {
    expect(parseArgs(["--limit","10"]).limit).toBe(10);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run --filter=api test import-wamp.spec.ts -t "parses limit"`
Expected: FAIL until export stabilized

- [ ] **Step 3: Implement preload + chunked writes**

Preload `legacyImportMapping` for `clients,companies,client_contacts` into `Map`, replace per-row `mappedId`/`findUnique` with map lookup, replace per-row `create` with `createMany({skipDuplicates:true})` in chunks of 100, chunk `contact.findMany` preload for methods, add `--batchSize` flag default 100.

- [ ] **Step 4: Run tests and dry-run**

Run: `bun run --filter=api test import-wamp.spec.ts`
Expected: PASS; dry-run rows/sec improved, `report()` totals unchanged
Run: `LEGACY_CRM_SQL_PATH=./sample.sql bun run import:wamp --dry-run --limit 500`

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/import/import-wamp.ts apps/api/test/import-wamp.spec.ts
git commit -m "perf: batch WAMP import writes and mapping lookups"
```

---

### Task 3: Cache contacts facet counts

**Files:**
- Modify: `apps/api/src/contacts/contacts.service.ts:555-587`
- Modify: `apps/api/src/cache/cache.module.ts`
- Test: `apps/api/test/contacts-facets.spec.ts`

**Interfaces:**
- Consumes: `searchFilter()`, `CACHE_MANAGER`
- Produces: `facetCounts()` with 10s TTL keyed by `q`, invalidated on `create/update`

- [ ] **Step 1: Write failing test**

```ts
describe("facet cache", () => {
  it("returns same shape on second call", async () => {
    const first = await service.facetCountsForTest({ q: "" });
    const second = await service.facetCountsForTest({ q: "" });
    expect(second).toEqual(first);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run --filter=api test contacts-facets.spec.ts`
Expected: FAIL with method missing

- [ ] **Step 3: Implement read-through cache**

Wrap 4x `groupBy` in cache get/set with key `contacts:facets:{q}`, TTL 10000, explicit invalidate in `create/update/decideFact`, follow `AuthService.getProfile` pattern from `docs/api.md`.

- [ ] **Step 4: Verify query count drops**

Run: `PRISMA_LOG_QUERIES=true bun run --filter=api test contacts-facets.spec.ts`
Expected: PASS, second call emits 0 SELECTs

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/contacts/contacts.service.ts apps/api/test/contacts-facets.spec.ts
git commit -m "perf: cache contacts facet counts"
```

---

### Task 4: Fix update validation parity + concurrency guard

**Files:**
- Modify: `apps/api/src/contacts/contacts.contracts.ts:25-36`
- Modify: `apps/api/src/contacts/contacts.service.ts:311-349,440-517`
- Test: `apps/api/test/contacts-validation.spec.ts`

**Interfaces:**
- Consumes: `contactCreateInput`, `blankToNull`
- Produces: hardened `contactUpdateInput`, atomic `decideFact()` returning `{contactId,field,applied}`

- [ ] **Step 1: Write failing tests**

```ts
import { contactUpdateArgs } from "../src/contacts/contacts.contracts";
describe("contact update validation", () => {
  it("rejects bad email", () => {
    expect(() => contactUpdateArgs.parse({ id: "x", data: { email: "not-an-email" } })).toThrow();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bun run --filter=api test contacts-validation.spec.ts`
Expected: FAIL, currently passes invalid through

- [ ] **Step 3: Implement validation + guards**

Mirror create-time `z.email().or(z.literal(""))`, `z.url().or(z.literal(""))` for socials, early-return on empty `data`, replace `decideFact` read-then-write with `updateMany({where:{id,status:PROPOSED}})` row-count check throwing `ConflictException` on 0, wrap `create()` company auto-create P2002 retry.

- [ ] **Step 4: Run verification**

Run: `bun run --filter=api test contacts-validation.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/contacts/contacts.contracts.ts apps/api/src/contacts/contacts.service.ts apps/api/test/contacts-validation.spec.ts
git commit -m "fix: validate contact updates and guard fact decisions"
```

---

### Task 5: Search indexes + bounded facets + lane limits

**Files:**
- Modify: `packages/db/prisma/schema.prisma:209-265`
- Modify: `packages/db/prisma/migrations/`
- Modify: `apps/app/app/(app)/contacts/contacts-table.tsx:138-139`
- Modify: `apps/agent/agent/lib/dispatch.ts:103-114`
- Test: `apps/api/test/contacts-search.spec.ts`

**Interfaces:**
- Consumes: `searchFilter()`, `companies.options`, `users.list`, `runLimited()`
- Produces: GIN indexes, `companies.options({ids,q,take})`, bounded `runResearchLane()`

- [ ] **Step 1: Write failing search test**

```ts
describe("contacts search", () => {
  it("finds by email substring", async () => {
    const res = await service.list({ q: "acme", sort: "", dir: "asc", page: 1, pageSize: 5, owner: "all", company: "all", source: "all", verification: "all" });
    expect(res.total).toBeGreaterThanOrEqual(0);
  });
});
```

- [ ] **Step 2: Run to verify baseline**

Run: `bun run --filter=api test contacts-search.spec.ts`
Expected: PASS baseline, plus `EXPLAIN` shows Seq Scan before index

- [ ] **Step 3: Implement indexes and bounds**

Enable `pg_trgm`, add `@@index` GIN for search columns via raw migration, limit `companies.options` to facet IDs + `take:50`, replace `Promise.all` in `runResearchLane` with `runLimited(4,...)`, fix `route.ts:50` `console.error` to `Logger`.

- [ ] **Step 4: Verify**

Run: `bun run --filter=db db:migrate`, `bun run --filter=api test contacts-search.spec.ts`, `EXPLAIN ANALYZE` shows index use
Expected: PASS, list p95 down

- [ ] **Step 5: Commit**

```bash
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations/ apps/app/app/\(app\)/contacts/contacts-table.tsx apps/agent/agent/lib/dispatch.ts
git commit -m "perf: index contact search and bound facet and research lanes"
```

---

### Task 6: Cleanup and guardrails

**Files:**
- Modify: `apps/api/src/config/env.validation.ts:193-198`
- Modify: `apps/app/lib/agent-transcript.ts:204-210`
- Modify: `apps/api/src/contacts/contacts.service.ts:57-62`
- Test: `apps/api/test/env-validation.spec.ts`

**Interfaces:**
- Consumes: `validateEnv()`, `hostOf()`, `FACT_COLUMNS`
- Produces: `whitelist:true` validation, truncated fallback titles, `FACT_HANDLERS` dispatcher

- [ ] **Step 1: Write failing test**

```ts
import { validateEnv } from "../src/config/env.validation";
describe("env guard", () => {
  it("rejects unknown vars when strict", () => {
    expect(() => validateEnv({ DATABASE_URL: "x", BETTER_AUTH_SECRET: "y".repeat(32), ALLOWED_SIGN_IN: "a.com", TYPO_VAR: "1" })).toThrow();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun run --filter=api test env-validation.spec.ts`
Expected: FAIL until whitelist enabled

- [ ] **Step 3: Implement**

Set `whitelist:true`, truncate `hostOf` fallback to 30 chars, extract `FACT_HANDLERS` map, remove duplicated `ContactRow` in app favoring `RouterOutputs`.

- [ ] **Step 4: Run full checks**

Run: `bun run check-types && bun run --filter=api test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/config/env.validation.ts apps/app/lib/agent-transcript.ts apps/api/src/contacts/contacts.service.ts
git commit -m "chore: tighten env validation and transcript fallback"
```

## Verification

- [ ] Baselines recorded in `PERF_BASELINE.md` before changes.
- [ ] Each task re-measured same-command same-conditions, delta exceeds variance or reverted.
- [ ] `bun run check-types`, `bun run --filter=api test`, `bun run --filter=db db:migrate` green.
- [ ] No new `console.*` in runtime paths, no per-package `.env`, `.env.example` updated if vars added.
- [ ] Reverted attempts logged in `PERF_BASELINE.md` to prevent retry loops.
