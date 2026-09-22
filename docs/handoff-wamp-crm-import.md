You are resuming work on the **WAMP CRM legacy data import + agent verification** project in the repo at `F:\crm`. No implementation has started yet. This prompt hands you a fully verified starting point so you do NOT need to re-explore, re-verify or rebuild context. Trust the facts below and the two documents they point to. Do the work in the order given.

## Authority

- **Design spec (source of truth, frozen):** `docs/specs/2026-08-05-wamp-crm-import-design.md`
- **Execution checklist (corrected):** `docs/plans/2026-08-05-wamp-crm-import.md`
- Where the plan and spec disagree, the **spec wins**. Everything you need is in those two files plus the verified ground truth below. Do not go re-reading the codebase from scratch; the facts here were read from source on 2026-08-06 and are authoritative.

## Objective

1. Import legacy WAMP CRM data into the CRM database. The source is the **MySQL dump** `E:\from_rpi400\www\crm\crm_final.sql` (~178 MB, 19 tables) — NOT a JSON export.
2. After import, every imported contact passes through the research agent (`apps/agent`) for OSInt verification, producing per-contact `verificationStatus` (`UNVERIFIED → VERIFYING → NEEDS_HUMAN → VERIFIED`) + `lastVerifiedAt`, driving a NEEDS_HUMAN queue in the UI.

## Verified ground truth (do not re-verify)

- Turborepo monorepo. `packages/{auth, db, env, typescript-config, ui}`; `apps/{agent, api, app}`. Single root `.env` loaded by `@crm/env` (`packages/env`; walks up to workspace root; `.env.local` wins). **Root `.env.example` DOES NOT EXIST — create it in WS3.** Read config via `@crm/env`, never `process.env` except in env modules. Missing keys degrade, never throw (see `apps/agent/agent/lib/capabilities.ts`).
- Prisma schema: `packages/db/prisma/schema.prisma` (generator → `../src/generated/prisma`). Drive Prisma from root: `db:generate|db:migrate|db:push|db:reset|db:seed|db:studio|db:deploy`. `packages/db/scripts/require-local-db.ts` guards destructive scripts against remote hosts (`ALLOW_REMOTE_DB=1` overrides). Migrations land on Neon (11 landed 2026-08-01).
- Current `Contact` has no address fields, no `verificationStatus`, no `lastVerifiedAt`. `Company` lacks only `streetAddress`. `AgentTask.contactId` is a bare required String (no relation). `Activity.createdById` is REQUIRED. `RecordSource.IMPORT` exists.
- `packages/db/src/agent-tasks.ts`: `TASK_KINDS = [brand, portrait, meeting-prep, identify, profile, recheck, company-profile, workspace-profile]` (add "verify"); `DIRECT_KINDS = [brand, portrait]`; `PRIORITY = {brand:900, portrait:800, workspace:500, requested:300, meeting:200, identify:100, sweep:50, companyProfile:40, recheck:0}` (add `verify: 60`).
- `apps/agent/agent/lib/dispatch.ts`: visible lane (BATCH=60, CONCURRENCY=6, LEASE=2min, DIRECT_KINDS only) + research lane (BATCH=12, LEASE=30min, everything else). `work()` has a `"profile" | "recheck"` case to mirror. `retireAbandoned()` → EnrichmentStatus.FAILED.
- `apps/agent/agent/lib/facts.ts`: `FIELDS = {name,title,linkedinUrl,twitterUrl,githubUrl,employer,seniority,function,location,tenure}` — extend with `email/phone/address` and those MUST pass `column: null` to bypass the `humanOwns` guard on prefilled imports. `recordFact` applies only when `band === VERIFIED`; returns `{stored, applied, band, score, rationale, reason?}`.
- API: NestJS + nestjs-trpc. Scripts: start=`bun src/main.ts`, test=`bun test`, lint=`biome check .`, check-types=`tsc --noEmit`, trpc:generate=`nestjs-trpc generate -e src/app.module.ts -r "**/*.router.ts" -o src/generated`. Env schema: `apps/api/src/config/env.validation.ts` (fails at boot).
- Task enqueue: `apps/api/src/agent/agent-trigger.service.ts` — `backfill({kind, reason, contactIds?, priority?}) → {queued, alreadyQueued}` (dedupes vs outstanding) + private `poke()` (POST `AGENT_URL`/internal/crm/dispatch, Bearer `AGENT_BRIDGE_SECRET`, timeout 2000ms). `apps/api/src/backfill/` is a NestJS lifecycle sweep (MAX_PER_RUN=500, 5-min) — keep separate from the import CLI.
- Agent: eve. `apps/agent/agent/agent.ts` ~19 lines (imports `@crm/env/load`, logs capabilities, `defineAgent({model: defineDynamic(...)})`). Tools in `apps/agent/agent/tools/` are auto-discovered — new file = done, no registration. Reference: `record_fact.ts`, `schedule_recheck.ts` (kind "recheck", days 1–730, budget 1–20 default 4), `set_contact_socials.ts` + `personForVerification` (verify-before-write template).
- Preamble: `apps/agent/agent/lib/preamble.ts` — `sessionPreamble(record, opened)`; test `apps/agent/test/preamble.integration.spec.ts`. Integration tests live in `<pkg>/test/*.integration.spec.ts`, run with `bun test`. apps/api currently has NO test files.
- Focus budget: `apps/agent/agent/lib/focus.ts` — `focusOn/spend/currentFocus`.
- Frontend: `apps/app` Next.js. Companies table `apps/app/app/(app)/companies/companies-table.tsx` uses `<EnrichmentIndicator status={row.enrichmentStatus} queued={row.queued}/>` + `isEnriching`. Contact sheet `apps/app/components/crm/record-sheet/contact-sheet.tsx` gates `EnrichmentBadge` on `contact.enrichmentStatus !== "COMPLETE"`.
- Env passthrough: `apps/agent/turbo.json` dev passThroughEnv = [AGENT_BRIDGE_SECRET, AI_GATEWAY_API_KEY, BLOB_READ_WRITE_TOKEN, CONTEXT_DEV_API_KEY, DATABASE_URL, GITHUB_TOKEN, PERPLEXITY_API_KEY, RAPIDAPI_KEY], test = [DATABASE_URL]. Root `turbo.json` globalPassThroughEnv has the full list; add new keys to both.

## Execution sequence (follow exactly; run the listed checks before marking done)

**WS0 Preflight** — `bun --version`; `bun install`; baseline `cd apps/api && bun run check-types && bun run lint` must be clean.

**WS1 Prisma** (`packages/db/prisma/schema.prisma`; spec §8):
- `ContactMethod{id cuid, contactId FK→Contact cascade, kind enum PHONE|EMAIL, label String?, value String, @@unique([contactId,kind,value])}`
- `Contact` + `streetAddress? city? stateCode? country? countryCode?` (String?)
- `Contact` + `verificationStatus` enum `ContactVerificationStatus{UNVERIFIED VERIFYING NEEDS_HUMAN VERIFIED}` `@default(UNVERIFIED)` + `lastVerifiedAt DateTime?`
- `Company` + `streetAddress String?`
- `LegacyImportMapping{legacyTable String, legacyId String, model enum 'Contact'|'Company'|'ContactMethod'|'Activity', crmId String, createdAt DateTime, @@unique([legacyTable,legacyId])}`
- NO Import/ContactImport models. NO verificationNotes (evidence lives in ContactFact).
- Migration: `bunx prisma migrate dev --name wamp_import_verification` from `packages/db`; check prisma validate + check-types.

**WS2 Task registry** — add `"verify"` to TASK_KINDS, `verify: 60` to PRIORITY. Check biome + check-types.

**WS3 Env** —
- CREATE root `.env.example` (missing): all vars from docs/environment.md + new ones, empty placeholders, no secrets (asserted by `packages/env/test/root.spec.ts`). Document the one-root-.env rule and `.env.local`-wins rule.
- New optional keys: `LEGACY_CRM_SQL_PATH`, `VERIFY_RECHECK_DAYS` (default 30), `EXA_API_KEY`, `BRAVE_API_KEY`, `TAVILY_API_KEY`, `FIRECRAWL_API_KEY`.
- Add the API-read ones (`@IsOptional`) to `apps/api/src/config/env.validation.ts`; add capability entries (shape `{env,label,gives,enabled}`) in `apps/agent/agent/lib/capabilities.ts`; add keys to root `turbo.json` globalPassThroughEnv and `apps/agent/turbo.json` dev passThroughEnv. Check api check-types + lint + boot (missing keys degrade, no throw).

**WS4 Verify plumbing** —
- Import CLI enqueues one AgentTask per contact (`kind:"verify"`, priority verify, reason `'imported from legacy WAMP CRM'`) via `backfill`, one call per priority bucket, budget 4. Import does NOT start sessions itself.
- `dispatch.ts` `work()`: add `case "verify"` (mirror `"profile"|"recheck"`). `preamble.ts`: verify branch in `sessionPreamble`. UI retry reuses `backfill({kind:"verify"})`.
- Check biome + check-types + `bun test` (preamble.integration.spec.ts passes).

**WS5 Verify tools** (drop in `apps/agent/agent/tools/`, auto-discovered):
- `set_verification_status.ts` (claim + VERIFYING; close to VERIFIED/NEEDS_HUMAN; copy `personForVerification`)
- `set_contact_methods.ts` (VERIFIED-band email/phone writes; APPLIED via this tool, not record_fact)
- Phase 1 offline format audit via `record_fact` with `email/phone/address` fields `column:null`, `method:'format-audit'`, bands VERIFIED/PROBABLE/POSSIBLE + evidence Json + one NOTE Activity per contact (never writes real columns → no humanOwns conflict)
- Phase 2 identity cross-ref (offline). Phase 3 OSInt gap-fill (2+ sources → VERIFIED/APPLIED; weak → PROPOSED → NEEDS_HUMAN; respect `spend()`). Phase 4 close: `lastVerifiedAt` + status + `schedule_recheck` (VERIFY_RECHECK_DAYS, default 30).
- Check biome + check-types + manual smoke.

**WS6 Guidance** — preamble decision criteria: VERIFIED = 2+ independent sources agree; NEEDS_HUMAN = weak/conflicting/insufficient; evidence ledger mandatory; never guess; on budget `{ok:false}` leave NEEDS_HUMAN and stop.

**WS7 Import CLI** (`apps/api/src/import/`) —
- `import-wamp.ts` standalone Bun entry, imports `@crm/env/load` itself, reads `LEGACY_CRM_SQL_PATH`. Flags `--dry-run`, `--limit N`, `--userId <uuid>` (REQUIRED unless dry-run — Activity.createdById required).
- Streaming SQL scanner: line accumulation until `;` at EOL outside quotes/backticks; stateful tokenizer; self-check row counts vs known table counts; reject invalid UTF-8/NUL; cap notes.
- Mapping order: lookups (countries, statuses→labels, lists→tag, users by EMAIL/NAME else ownerId null, no stubs) → Companies (dedupe domain) → Contacts (split name, source IMPORT, UNVERIFIED) → ContactMethods (E.164 best-effort, label from phone_types, primary → Contact.email/phone) → one NOTE Activity per client (body=notes diary, occurredAt=created_at).
- Collision: existing email/domain → attach, never silently drop. Provenance: LegacyImportMapping per entity; idempotent (skip already-mapped). One AgentTask kind "verify" per contact; one backfill per bucket; budget 4.
- package.json `"import:wamp": "bun src/import/import-wamp.ts"`. Run: `bun run --filter=api import:wamp`.
- Test: `apps/api/test/import-wamp.spec.ts` + fixture SQL — asserts N contacts UNVERIFIED, malformed rows warn without crash, second run idempotent. Check bun test + lint + check-types.

**WS8 UI** — contacts table under `apps/app/app/(app)/contacts/` (grep `enrichmentStatus`). Mirror companies table: verification badge on `contact.verificationStatus`, status column, "Needs human review" filter → NEEDS_HUMAN (+ FAILED). Contact sheet shows status + lastVerifiedAt. Regenerate trpc types. Check app lint + check-types + manual smoke.

**WS9 Full verification** — real import E2E (`bun run --filter=api import:wamp`) → rows + LegacyImportMapping + queued tasks → agent verifies → statuses land → UI queue. check-types + lint + `bun test` in api/agent/app. Confirm **no `.env` touched**, only `.env.example`.

## Rules

- No code comments (repo AGENTS.md). Don't commit unless asked (repo is not a git repo; write-only).
- Implement → run the listed check → mark done. Never proceed past a failing check.
- Search before writing; mirror existing patterns. Use `@/` aliases.
- Use subagent-driven-development; sync after each task group.

## Exact commands you will need

- `bun --version`
- `bun install`
- `cd apps/api && bun run check-types && bun run lint`
- `bunx prisma migrate dev --name wamp_import_verification` (from `packages/db`)
- `bun test`
- `bun run --filter=api import:wamp`
- `bun run --filter=api trpc:generate`
- `bunx prisma validate`

## Out of scope

Dedupe against existing CRM contacts; VoIP cold calling; CSV handling; diary splitting.
