# Code Review Report

**Target**: F:\crm (monorepo — NestJS API, Next.js 16 app, eve agent, shared packages)
**Reviewers**: Security, Performance, Architecture, Testing (multi-reviewer-patterns)
**Date**: 2026-09-14
**Files Reviewed**: ~400 TS/TSX across `apps/api` (106), `apps/app` (119), `apps/agent` (91), `packages` (85)

**Deduplication**: 1 merge — SEC-005 and ARCH-001 both flagged the committed `BETTER_AUTH_SECRET` in `.env.example`; merged into one finding at the higher severity (High). Cross-referenced: TEST-003↔SEC-002 (owner bootstrap/demotion), TEST-002↔SEC-007 (SSO registration).

---

## High Findings (8)

### [H-01] Committed session-signing secret in `.env.example` + failing env test
**Location**: `.env.example:8`, `INSTALL.md:950`, `packages/env/test/root.spec.ts:78-86`
**Dimensions**: Security, Architecture
**Description**: `BETTER_AUTH_SECRET="MqQi8l6apIUPiyFinjGzRMGhQ4Hmhgki5c/KSO+D5Hw="` ships as a real-looking value in both files. The repo's own env test enforces `.env.example` ships empty placeholders and is **red today** (6 pass, 1 fail). A self-hoster copying the example deploys with a publicly known session-signing key.
**Impact**: Session forgery / auth bypass on any install that doesn't rotate the key; CI is failing.
**Fix**: Set to `""`, rotate any live secret copied from it, make the env test part of the gate.

### [H-02] Research lane runs unbounded `Promise.all` — docs claim a cap that doesn't exist
**Location**: `apps/agent/agent/lib/dispatch.ts:103-114`
**Dimension**: Performance
**Description**: `runResearchLane` claims 12 tasks and starts them all with `Promise.all` — no `runLimited(4)`. `PERF_BASELINE.md` and `docs/agent.md` both claim a 4-session cap.
**Impact**: Up to 18 concurrent agent sessions per tick (6 visible + 12 research) → burst LLM spend, rate-limit spikes, DB contention.
**Fix**: Wrap in `runLimited(4)` or slice `RESEARCH_BATCH`; update docs/ledger.

### [H-03] Facet counts are not cached (ledger claims a 10s cache)
**Location**: `apps/api/src/contacts/contacts.service.ts:542-568`, `companies/companies.service.ts:471-503`, `deals/deals.service.ts:348-380`
**Dimension**: Performance
**Description**: Each list renders 3-7 `groupBy`/count queries on every load, pagination, and search keystroke. `PERF_BASELINE.md` claims a "facetCounts 10s cache" that doesn't exist in code.
**Impact**: Re-aggregation of the whole matching set per keystroke; sequential scans under search filters.
**Fix**: Read-through cache keyed by search filter (10s TTL), invalidated on writes.

### [H-04] No pg_trgm index; all search is `LIKE '%term%'`
**Location**: `contacts.service.ts:511-523`, `companies.service.ts:438-448`, `deals.service.ts:311-321`, `search/search.service.ts`
**Dimension**: Performance
**Description**: No `pg_trgm` migration exists; `schema.prisma` has no trigram GIN indexes on name/email/domain.
**Impact**: Sequential scans on every search (quick-switcher, list search). Dominant cost at tens of thousands of rows.
**Fix**: `CREATE EXTENSION pg_trgm` + GIN indexes on `company(name, domain)`, `contact(firstName, lastName, email)`, `deal(name)`.

### [H-05] Revenue paths in the API are untested
**Location**: `apps/api/src/{deals,activities,dashboard,search,companies,contacts,users,settings}/**`
**Dimension**: Testing
**Description**: Zero tests for deals stage-change clock + activity stamping, `ActivityStamp`, `DashboardService` KPI math, `SearchService`. `auth.e2e.spec.ts` only exercises 401/guard paths.
**Impact**: Core revenue logic can regress with no test signal.
**Fix**: Service tests with mocked `Db` (following `sso.spec.ts` style) + integration tests for the deal→activity→enrichment chain.

### [H-06] The `/eve/v1` proxy — the documented enforcement point — is untested
**Location**: `apps/app/app/eve/v1/[...path]/route.ts:10-107`
**Dimension**: Testing
**Description**: Session gate (401), `bridgeConfigured` (503), header sanitization (request-smuggling surface), `x-crm-*` carving + `cuid()` validation, upstream-failure → 502 — none covered. Only token mint/verify are tested.
**Impact**: The one place that checks the session before the agent sees anything can regress silently.
**Fix**: Unit-test the handler with stubbed fetch/session: unconfigured→503, no session→401, upstream error→502, headers stripped.

### [H-07] No CI pipeline
**Location**: `.github/workflows/` (empty)
**Dimension**: Testing
**Description**: `turbo run test` exists but nothing runs it as a merge gate. Docs promise merge-blocking CI.
**Impact**: Every finding in this report can ship to main undetected.
**Fix**: Add a workflow running `turbo run test` with `DATABASE_URL` + `TEST_RUN_ID` per shard; block merge on the suite.

---

## Medium Findings (17)

### Security
- **[M-01] Access revocation is impossible** — `packages/auth/src/auth.ts:104-123`, `organization.ts:69-81`. `ALLOWED_SIGN_IN` only gates new users; members are auto-re-enrolled every sign-in; no remove-member or session-revocation API. Departed/compromised accounts keep full access forever. Fix: enforce allow-list in `session.create.before`, add admin `removeMember` that deletes the row + revokes sessions.
- **[M-02] Workspace ownership bootstrapped to first signer** — `packages/auth/src/organization.ts:47-67`. Earliest-created user becomes owner with no recovery path; the one-owner-minimum guard then blocks demotion. Fix: bootstrap from config (`OWNER_EMAILS`), require second-owner confirmation.
- **[M-03] `safeFetch` DNS-rebinding TOCTOU + missing IPv6 encapsulation ranges** — `packages/db/src/safe-fetch.ts:88-116, 21-26`. Validates via `dns.lookup`, then `fetch` re-resolves (attacker domain can flip public↔private between check and request); doesn't block 6to4 `2002::/16` / Teredo `2001::/32` (vendored eve `web_fetch` does). Fix: resolve once and connect to validated IP; add the ranges.

### Performance
- **[M-04] `PERF_BASELINE.md` ledger unreliable** — three "kept" claims (H-02, H-03, H-04) are false. Future reviewers skip re-verification. Fix: correct entries with verification date or add guardrail tests.
- **[M-05] Backfill sweeps build unbounded `NOT IN` lists** — `backfill/backfill.service.ts:264-282, 299-323`. Loads all 30-day `brand`/`portrait` tasks into memory, filters with `id NOT IN (...)`, no `(kind, finishedAt)` index. Fix: `NOT EXISTS` subquery + composite index.
- **[M-06] Dashboard runs 7 queries incl. unbounded 6-month deal read** — `dashboard/dashboard.service.ts:46-144`. No `take` on `recentDeals`, no `(createdById, createdAt)` index, refetches on every window focus. Fix: SQL `date_trunc` aggregation, `take`, covering indexes, 30s cache.
- **[M-07] Companies list pays ~201 subqueries per page** — `companies.service.ts:119-133`. Correlated `_count.contacts` + filtered `_count.deals` per row + `queuedCompanies()`. Fix: denormalize counts on writes or single aggregation query.
- **[M-08] Conversations cache is per-instance** — `conversations/conversations.service.ts:39-79`. In-memory fallback (default self-host) means multiple API instances serve divergent 10-min lists. Fix: document or invalidate on agent event writes.

### Architecture
- **[M-09] Facts contract drift: email/phone non-writable but undocumented** — `docs/agent.md` ~330 vs `apps/agent/agent/lib/facts.ts` (`column: null`), policy only in `preamble.ts:322`. A contributor following the doc would add `email` to `FACT_COLUMNS`, bypassing the deliberate sensitive-fields design. Fix: document the exception.
- **[M-10] Three copies of eve; canonical version ambiguous** — root `package.json` (`^0.31.2`), `apps/agent/package.json` (`^0.29.4`), vendored `eve-0.31.2/` (3121 files). Fix: drop root deps; delete or clearly label the vendored mirror.
- **[M-11] Kind-agnostic "already queued" check mislabels contacts** — `apps/api/src/agent/agent-queue.service.ts` `isQueued` vs kind-specific dedupe in `agent-trigger.service.ts`. A contact with a pending `meeting-prep` task reports "researching". Fix: make `isQueued` kind-aware.

### Testing
- **[M-12] SSO registration/deletion untested** — `apps/api/src/sso/sso.service.ts:178-288`. Domain validation, `registerSSOProvider` call, error mapping, owner/admin gating all uncovered.
- **[M-13] Last-owner-demotion transaction untested** — `apps/api/src/workspace/workspace.service.ts:216-228`. The documented `FOR UPDATE` invariant has no test. (Cross-ref M-02.)
- **[M-14] Backfill orchestration untested** — `backfill/backfill.service.ts`. The 30-day recheck windows and `MAX_PER_RUN` caps (a regression re-reads forty team pages per sweep, spending Context.dev credits silently) have zero specs.
- **[M-15] No DOM/component tests anywhere** — `apps/app` and `packages/ui` have no jsdom/vitest/testing-library; `packages/ui` has no `test` script. All 15 `components/crm/*.tsx` are only source-grepped.
- **[M-16] `auth.e2e.spec.ts` falls back to a hardcoded dev DB** — `apps/api/test/auth.e2e.spec.ts:12-20` silently defaults to `postgresql://postgres:postgres@localhost:5432/crm` and boots the real `AppModule`. First authenticated write pollutes the shared dev DB.
- **[M-17] No authenticated journey exercises the permission matrix** — member vs admin vs owner outcomes through real router calls never asserted; role gates proven only by pure-function tests.

---

## Low Findings (13)

- **Security**: [L-01] `conversations.save` mutates another user's row before the ownership check throws (`conversations.service.ts:90-120`); [L-02] agent dispatch bearer check not constant-time (`channels/crm.ts:9-14`); [L-03] SSO registration triggers unguarded server-side fetch to admin-supplied issuer (`sso.service.ts:193-208`); [L-04] any member can switch the agent model, no admin gate (`settings.router.ts:25-28`); [L-05] app `/api/*` route is an unauthenticated proxy that leaks `API_URL` on 502 (`apps/app/app/api/[...path]/route.ts:14-59`).
- **Performance**: [L-06] `claimDue` ORDER BY not index-aligned (`agent/lib/tasks.ts`); [L-07] activities timeline needs `(companyId, occurredAt)` composite at high volume; [L-08] `workspace.get` does 2 queries per request on settings/members pages.
- **Architecture**: [L-09] agent turbo `passThroughEnv` missing vars the agent reads (`VOIPSTUDIO_API_KEY`, `GOOGLE_CSE_ID`, etc.); [L-10] API declares `KOKORO_TTS_*` it never reads (`env.validation.ts:172-180`); [L-11] dead env passthrough declarations (`AUTH_TRUSTED_ORIGINS`, `NEXT_PUBLIC_AUTH_URL`); [L-12] housekeeping — unused `context.dev` dep, untracked `dbping.tmp.ts`, in-flight `sql_dump` deletions.
- **Testing**: [L-13] `agent-session.spec.ts` asserts implementation by source-grep (`toContain("keepMounted: true")`) — a valid refactor fails falsely, a behavior change passes vacuously.

---

## Summary

| Dimension | Critical | High | Medium | Low | Total |
|---|---|---|---|---|---|
| Security | 0 | 1 | 3 | 5 | 9 |
| Performance | 0 | 3 | 5 | 3 | 11 |
| Architecture | 0 | 1* | 3 | 4 | 8 |
| Testing | 0 | 3 | 6 | 1 | 10 |
| **Total** | **0** | **8** | **17** | **13** | **37** |

\* H-01 is the merged Security+Architecture finding; counted once in the total.

## Recommendation

The codebase is genuinely well-engineered — no unauthenticated/externally exploitable vulnerability, no injection, no committed real secrets, agent egress strongly contained, and the agent + shared-package test suites are behavior-first against real Postgres. The risk is concentrated in three places:

1. **Fix H-01 immediately** — it's a committed signing key, a red CI test, and a self-hoster footgun in one.
2. **Reconcile the docs with reality** — H-02/H-03/H-04 and M-04 are all "the baseline ledger says fixed, the code isn't." Either implement the claimed caps/cache/index or correct the ledger; the drift is actively masking regressions.
3. **Wire up CI and cover the enforcement points** — H-05/H-06/H-07 are the places a sev-1 escapes today: untested revenue paths, an untested auth enforcement point, and no merge gate.

Priority order: H-01 → H-07 (CI) → H-02/H-03/H-04 (perf claims) → H-05/H-06 (test coverage) → M-01/M-02 (deprovisioning/ownership) → remainder.