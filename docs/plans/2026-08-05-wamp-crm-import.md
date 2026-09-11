# Plan: CRM + VoIP/SIP Implementation + Voice Agents Verification

## 0. State — resume here

- The design is approved and frozen: `docs/specs/2026-08-05-wamp-crm-import-design.md`. This plan is the execution checklist for that spec. Where the two differ, **the spec wins**.
- No implementation has started yet. The repo is **not** a git repo (write-only, no commits). Do not commit unless asked.
- All "verified ground truth" in §2 was read from source on 2026-08-06. Trust it over any earlier guess (an earlier draft of this plan contained wrong paths, wrong env keys and two schema models the spec rejected — all corrected below).

## 1. Goal

1. Import the legacy WAMP CRM data into the CRM database. The authoritative source is the **MySQL dump** `E:\from_rpi400\www\crm\crm_final.sql` (~178 MB, 19 tables) — **not** a JSON export.
2. After import, every imported contact passes through the research agent (`apps/agent`) for OSInt verification, producing a per-contact `verificationStatus` (`UNVERIFIED → VERIFYING → NEEDS_HUMAN → VERIFIED`) and `lastVerifiedAt`, which drives a NEEDS_HUMAN work queue surfaced in the UI.

## 2. Verified ground truth (read from source 2026-08-06)

- **Repo layout**: Turborepo monorepo. `packages/{auth, db, env, typescript-config, ui}`; `apps/{agent, api, app}`. Single root `.env` loaded by `@crm/env` (`packages/env`, walks up from cwd to workspace root; `.env.local` wins). Root `.env.example` **does not exist** — create it in WS3 (docs/environment.md, `.gitignore` and `env.validation.ts` all already reference it).
- **Prisma**: schema at `packages/db/prisma/schema.prisma` (provider postgresql, generator `prisma-client` → `../src/generated/prisma`). Run Prisma from root via turbo scripts `db:generate|db:migrate|db:push|db:reset|db:seed|db:studio|db:deploy`; `packages/db/prisma.config.ts` loads root `.env` itself; `packages/db/scripts/require-local-db.ts` guards the destructive scripts against non-local hosts (`ALLOW_REMOTE_DB=1` overrides; `db:deploy` deliberately unguarded).
- **Current Contact** has no `street/city/state/country` and no `verificationStatus/lastVerifiedAt`. Company lacks only `streetAddress` (of the address group). `AgentTask.contactId` is a bare required String with no relation. `Activity.createdById` is REQUIRED. `RecordSource.IMPORT` already exists.
- **Agent task registry** `packages/db/src/agent-tasks.ts`: `TASK_KINDS = [brand, portrait, meeting-prep, identify, profile, recheck, company-profile, workspace-profile]` (no "verify" yet); `DIRECT_KINDS = [brand, portrait]`; `PRIORITY = {brand:900, portrait:800, workspace:500, requested:300, meeting:200, identify:100, sweep:50, companyProfile:40, recheck:0}`.
- **Agent dispatch** `apps/agent/agent/lib/dispatch.ts`: visible lane (`VISIBLE_BATCH=60`, `VISIBLE_CONCURRENCY=6`, `VISIBLE_LEASE_MS=2*60_000`, only DIRECT_KINDS) and research lane (`RESEARCH_BATCH=12`, `RESEARCH_LEASE_MS=30*60_000`, everything except DIRECT_KINDS). `work()` has a `"profile" | "recheck"` case to mirror; `retireAbandoned()` settles `EnrichmentStatus.FAILED`.
- **Facts ledger** `apps/agent/agent/lib/facts.ts`: `FIELDS = {name,title,linkedinUrl,twitterUrl,githubUrl,employer,seniority,function,location,tenure}` — must be extended with `email/phone/address` and those new fields **must pass `column:null`** so the `humanOwns` guard is bypassed on prefilled imports. `recordFact(input)` → `{stored, applied, band, score, rationale, reason?}`; applies only when `band === VERIFIED`; `humanOwns` reads only the selected columns.
- **Capabilities** `apps/agent/agent/lib/capabilities.ts`: entries shaped `{env, label, gives, enabled}` — RAPIDAPI_KEY, PERPLEXITY_API_KEY, CONTEXT_DEV_API_KEY, BLOB_READ_WRITE_TOKEN. A missing key turns a capability off; it never throws.
- **Env passthrough**: `apps/agent/turbo.json` dev passThroughEnv = `[AGENT_BRIDGE_SECRET, AI_GATEWAY_API_KEY, BLOB_READ_WRITE_TOKEN, CONTEXT_DEV_API_KEY, DATABASE_URL, GITHUB_TOKEN, PERPLEXITY_API_KEY, RAPIDAPI_KEY]`, test = `[DATABASE_URL]`. Root `turbo.json` globalPassThroughEnv already includes the full set (DATABASE_URL, DATABASE_URL_UNPOOLED, BETTER_AUTH_SECRET, BETTER_AUTH_URL, ALLOWED_SIGN_IN, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, AUTH_COOKIE_DOMAIN, CRON_SECRET, REDIS_URL, CACHE_TTL_MS, PORT, PRISMA_LOG_QUERIES, PERPLEXITY_API_KEY, RAPIDAPI_KEY, CONTEXT_DEV_API_KEY, GITHUB_TOKEN, BLOB_READ_WRITE_TOKEN, AI_GATEWAY_API_KEY, VERCEL_OIDC_TOKEN, AGENT_URL, AGENT_BRIDGE_SECRET).
- **API**: NestJS + nestjs-trpc. Scripts: start=`bun src/main.ts`, test=`bun test`, lint=`biome check .`, check-types=`tsc --noEmit`, trpc:generate=`nestjs-trpc generate -e src/app.module.ts -r "**/*.router.ts" -o src/generated`. No test files exist yet in apps/api. Env schema `apps/api/src/config/env.validation.ts` (class-validator, fails at boot).
- **Task enqueue**: `apps/api/src/agent/agent-trigger.service.ts` — `backfill({kind, reason, contactIds?, priority?}) → {queued, alreadyQueued}` (dedupes against outstanding tasks) and a private `poke()` (POST `AGENT_URL`/internal/crm/dispatch, Bearer `AGENT_BRIDGE_SECRET`, `AbortSignal.timeout(2000)`). `apps/api/src/backfill/` is a NestJS lifecycle sweep (`MAX_PER_RUN=500`, 5-minute auto sweep) — keep it separate from the CLI.
- **Agent**: eve. `apps/agent/agent/agent.ts` (~19 lines): imports `@crm/env/load`, logs capabilities, `defineAgent({model: defineDynamic(...)})`. Tools in `apps/agent/agent/tools/` (~20 files) are auto-discovered — adding a file is enough, no registration. Reference tools: `record_fact.ts` (z.enum of FACT_FIELDS), `schedule_recheck.ts` (kind "recheck" hardcoded, `days` int 1–730 no default, `budget` 1–20 default 4), `set_contact_socials.ts` with `personForVerification` — the verify-before-write template to copy.
- **Preamble**: `apps/agent/agent/lib/preamble.ts` — `sessionPreamble(record, opened)`; integration test `apps/agent/test/preamble.integration.spec.ts` exists. Tests live in `<pkg>/test/*.integration.spec.ts` run with `bun test` (pattern: `apps/agent/test/facts.integration.spec.ts`).
- **Focus budget**: `apps/agent/agent/lib/focus.ts` — `focusOn/spend/currentFocus`.
- **Frontend**: `apps/app` Next.js. Companies table `apps/app/app/(app)/companies/companies-table.tsx` uses `<EnrichmentIndicator status={row.enrichmentStatus} queued={row.queued}/>` + `isEnriching(...)`; contact sheet `apps/app/components/crm/record-sheet/contact-sheet.tsx` gates `EnrichmentBadge` on `contact.enrichmentStatus !== "COMPLETE"`.
- **docs/environment.md** is accurate about the one-`.env` rule but cites a `.env.example` that is currently missing — created in WS3.

## 3. Execution rules

- No code comments (AGENTS.md). No coauthoring commits; don't commit unless asked.
- Every task: implement → run the listed check → only then mark done. Do not proceed past a failing check.
- Use `@/` aliases. Read config via `@crm/env`, never `process.env` directly except in env modules.
- Subagents work in task groups and sync after each. Use subagent-driven-development.
- Search the codebase before writing; mirror existing patterns exactly.

## 4. Workstreams

### WS0 — Preflight
- Verify `bun --version`.
- `bun install` at root.
- Baseline: `cd apps/api && bun run check-types && bun run lint` — must be clean before touching code.
- Read `apps/api/src/config/env.validation.ts` and `apps/api/src/generated/*` to absorb the trpc/env patterns.

### WS1 — Prisma schema (`packages/db/prisma/schema.prisma`)
Add (design spec §8):
- `ContactMethod`: `id` cuid, `contactId` required FK → Contact (onDelete cascade), `kind` enum `PHONE | EMAIL`, `label` String?, `value` String, `@@unique([contactId, kind, value])`.
- `Contact` + `streetAddress`? `city`? `stateCode`? `country`? `countryCode`? (all String?).
- `Contact` + `verificationStatus` enum `ContactVerificationStatus { UNVERIFIED VERIFYING NEEDS_HUMAN VERIFIED }` `@default(UNVERIFIED)` + `lastVerifiedAt` DateTime?.
- `Company` + `streetAddress` String? only.
- `LegacyImportMapping`: `legacyTable` String, `legacyId` String, `model` enum `'Contact' | 'Company' | 'ContactMethod' | 'Activity'`, `crmId` String, `createdAt` DateTime; `@@unique([legacyTable, legacyId])`.
- **No** `Import`/`ContactImport` models (spec rejected them). **No** `verificationNotes` — evidence lives in the ContactFact ledger.

Check: `bunx prisma migrate dev --name wamp_import_verification` from `packages/db`, then prisma validate + root check-types.

### WS2 — Agent task registry (`packages/db/src/agent-tasks.ts`)
- Add `"verify"` to `TASK_KINDS`.
- Add `verify: 60` to `PRIORITY`.

Check: biome + check-types.

### WS3 — Env, capabilities and .env.example
- **Create root `.env.example`** (currently missing): every variable from docs/environment.md + the new ones below, empty-string placeholders, following the `.env.example` conventions asserted by `packages/env/test/root.spec.ts` (no secrets). Also add a comment block explaining the one-root-.env rule and the `.env.local`-wins rule.
- New optional keys (spec §7): `LEGACY_CRM_SQL_PATH` (path to `crm_final.sql`), `VERIFY_RECHECK_DAYS` (numeric, default 30), `EXA_API_KEY`, `BRAVE_API_KEY`, `TAVILY_API_KEY`, `FIRECRAWL_API_KEY` (Phase-3 research).
- `apps/api/src/config/env.validation.ts`: declare the ones the API reads with `@IsOptional()`.
- `apps/agent/agent/lib/capabilities.ts`: add entries for exa/brave/tavily/firecrawl following the existing shape.
- Root `turbo.json` globalPassThroughEnv and `apps/agent/turbo.json` dev passThroughEnv: add the new keys.

Check: apps/api `bun run check-types && bun run lint`; boot the API and confirm missing keys degrade (no throw).

### WS4 — Agent task plumbing (verify through existing dispatch)
- The import CLI enqueues one `AgentTask` per contact (`kind: "verify"`, priority `verify`, reason `'imported from legacy WAMP CRM'`) via `AgentTriggerService.backfill` — **one `backfill()` call per priority bucket** (spec §3; budget 4). Import does not start sessions itself.
- `apps/agent/agent/lib/dispatch.ts` `work()`: add a `"verify"` case that starts the verify session (mirror the `"profile" | "recheck"` case).
- `apps/agent/agent/lib/preamble.ts`: add a verify branch to `sessionPreamble` describing the 4-phase flow.
- The UI "verify now" retry reuses `backfill({kind: "verify"})`.

Check: biome + check-types + `bun test` (preamble.integration.spec.ts must still pass).

### WS5 — Verify tools (drop files in `apps/agent/agent/tools/`)
- `set_verification_status.ts`: claim + set VERIFYING on the target (copy `personForVerification` from set_contact_socials); final transition to VERIFIED/NEEDS_HUMAN at close. Structured JSON returns.
- `set_contact_methods.ts`: verified email/phone writes — only `band === VERIFIED`; APPLIED via this tool, not `record_fact` (the `humanOwns` guard).
- Phase 1 offline format audit — `record_fact` calls with the ledger fields `email`, `phone`, `address` (plus `name`/`title`/… as needed), each `column: null`, `method: 'format-audit'`, band VERIFIED/PROBABLE/POSSIBLE, evidence Json; one NOTE Activity per contact. Format audit never writes real columns, so it never trips `humanOwns` on prefilled imports.
- Phase 2 identity cross-ref (offline), e.g. telia.se + address → country Sweden VERIFIED.
- Phase 3 OSInt gap-fill: only when evidence is positive; 2+ sources → VERIFIED/APPLIED via `set_contact_methods`; weak/conflicting → PROPOSED → NEEDS_HUMAN. New research tools (exa/brave/tavily/firecrawl) or extend `research_person` — follow existing tool patterns and respect `spend()` budget.
- Phase 4 close: `lastVerifiedAt` + status VERIFIED or NEEDS_HUMAN + `schedule_recheck` (`VERIFY_RECHECK_DAYS`, default 30).

Check: biome + check-types + manual smoke against a seeded contact.

### WS6 — Verify flow guidance (preamble + instructions)
- `sessionPreamble` verify branch decision criteria: **VERIFIED** = 2+ independent sources agree; **NEEDS_HUMAN** = weak/conflicting/insufficient; evidence ledger is mandatory; never guess; budget discipline — `spend` before each research step and on `{ok: false}` leave NEEDS_HUMAN and stop.

Check: agent starts a verify session against a seeded record without error.

### WS7 — Import CLI (`apps/api/src/import/`)
- `import-wamp.ts` — standalone Bun entry (`bun src/import/import-wamp.ts`), imports `@crm/env/load` itself. Reads `LEGACY_CRM_SQL_PATH`. Flags: `--dry-run`, `--limit N`, `--userId <uuid>` (REQUIRED unless `--dry-run`, because `Activity.createdById` is required).
- Hand-rolled streaming SQL scanner: read line by line; accumulate a statement until `;` at end of line outside quotes/backticks (stateful tokenizer); self-check parsed row counts against known table counts; reject invalid UTF-8/NUL; cap notes.
- Mapping order (spec §3): lookups (countries, statuses→labels, lists→tag, users by EMAIL or NAME else `ownerId` null — no stubs) → Companies (dedupe on domain) → Contacts (split name, `source: IMPORT`, `verificationStatus: UNVERIFIED`) → ContactMethods (phone digits → E.164 best-effort, label from `phone_types`, primary → `Contact.email`/`phone`) → one NOTE Activity per client (body = notes diary, `occurredAt = created_at`).
- Collision policy: existing email/domain → attach to existing, never silently drop.
- Provenance: a `LegacyImportMapping` row for every created entity (`legacyTable`, `legacyId`, `model`, `crmId`). Idempotent via `LegacyImportMapping` (skip already-mapped legacy ids).
- Enqueue one AgentTask `kind: "verify"` per contact (reason `'imported from legacy WAMP CRM'`); one `backfill()` per priority bucket; budget 4.
- `apps/api/package.json`: add `"import:wamp": "bun src/import/import-wamp.ts"`. Root invocation: `bun run --filter=api import:wamp`.
- Tests: `apps/api/test/import-wamp.spec.ts` with a fixture SQL file — asserts N contacts UNVERIFIED; malformed rows warn without crashing; second run is idempotent.

Check: run against fixture, `bun test`, lint, check-types.

### WS8 — UI (`apps/app`)
- Locate the contacts table under `apps/app/app/(app)/contacts/` (grep `enrichmentStatus`). Mirror the companies table: a verification badge bound to `contact.verificationStatus`; a status column; a "Needs human review" filter → NEEDS_HUMAN (+ FAILED) using the existing filter mechanism.
- Contact sheet: show `verificationStatus` + `lastVerifiedAt`, mirroring the `EnrichmentBadge` placement.
- Regenerate trpc types (`trpc:generate` in apps/api) so the app sees the new fields.

Check: app lint + check-types + manual smoke; confirm the NEEDS_HUMAN filter returns the right rows.

### WS9 — Full verification
- E2E: `bun run --filter=api import:wamp` against the real dump → DB rows + `LegacyImportMapping` + AgentTasks queued → agent verifies → statuses land → UI queue shows NEEDS_HUMAN.
- check-types + lint + `bun test` in api, agent, app.
- Confirm **no `.env` was touched** — only `.env.example`.

## 5. Risks / decisions

- Source format RESOLVED: the SQL dump is authoritative (no sample-file fetch needed; WS7 reads `LEGACY_CRM_SQL_PATH`).
- Dedupe against existing CRM contacts is out of scope; verification flags suspects only.
- `Contact.verificationNotes` deliberately not added — evidence lives in the ContactFact ledger.
- Prefer eve's own session/event dispatch (see `hooks/` and `apps/agent/node_modules/eve/docs`) if anything unexpected surfaces during WS4.
