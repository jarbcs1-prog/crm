# CRM + VoIP Implementation + Verification Agent — Design

Repo: `F:\crm` (single-tenant, agentic-first CRM)

## 1. Goals

Import an existing investor database (`F:\crm\sql_dump\crm_final.sql`, a 169 MB MySQL/WAMP dump) into this CRM then configure the eve agent to **verify and enrich** the imported profiles:

- **Priority 1 (now):** data verification & enrichment — contact presence, validity, identity cross-referencing and OSInt research to fill gaps.
- **Priority 2 (later):** cold-calling/lead qualification via VoIP/SIP — the verified profiles become the "verified & reachable" list.

Import source is the SQL dump only. The `F:\crm\sql_dump` CSVs are partial snapshots and are NOT used.

## 2. Design principles

- **Intelligence lives in the agent, never in the API.** The import/API layer only writes `AgentTask` queue rows; the eve agent leases work (`FOR UPDATE SKIP LOCKED`) and decides what to do.
- **Nothing about a person is guessed.** Tools report observed facts. Strong evidence writes to the record; weak evidence becomes a human-settled suggestion via the `ContactFact` ledger (`VERIFIED/PROBABLE/POSSIBLE`, status `APPLIED/PROPOSED/DISMISSED/SUPERSEDED`, `decidedBy`).
- **Single tenant.** No organizations. One user (allow-list, Google-only).
- **Optional capability degradation.** Missing env key removes a capability, never throws (existing `apps/agent/agent/lib/capabilities.ts` pattern).
- **Deterministic, re-runnable import.** Idempotency via the `LegacyImportMapping` provenance table — every insert consults it first and skips already-mapped legacy rows (counted as "skipped" in the summary).

## 3. Legacy schema → target mapping

19 legacy tables (CREATE TABLE scan of the dump):

| Legacy | Target | Notes |
|---|---|---|
| `clients` | `Contact` | name/title/address/status; `notes` diary → `Activity` rows |
| `client_contacts` | `Contact.email` + `Contact.phone` + `ContactMethod` | phones raw int digit strings → E.164 canonicalization |
| `companies` | `Company` | domain/email/phone/fax |
| `countries` | `Company.country` / via iso3166 | match by iso3166 or name |
| `lists` | tag/source metadata | campaign provenance |
| `users` | `Contact.ownerId` | legacy owner (match by **email or name** — `User` has no username column) |
| `phone_types` | phone label | mobile/home/work/fax |
| `statuses` | mapped label | legacy sales status |
| `client_shares`, `stocks`, `positions`, `trunks`, `groups`, `refs`, `group_permissions`, `company_employees`, `list_duplicates` | **archive only** | out of scope |

Note: legacy `clients.notes` (mediumtext) is a rich dated sales diary (2008–2009 era call/email log). Imported raw as one NOTE `Activity` per client; individual diary-entry splitting is deferred (timestamps preserved in the text).

## 4. Schema changes (`packages/db/prisma/schema.prisma`, one migration)

1. **NEW model `ContactMethod`**: `{ contactId FK, kind: PHONE|EMAIL, label (from legacy phone_types), value, canonical? }` — the CRM `Contact` has exactly one email + one phone field, but legacy clients have many phones/emails of different types. `Contact.email`/`phone` keep the primary; `ContactMethod` holds 1..n verified methods. **Dedupe on write** (no new row if `(contactId, kind, value)` already exists) — repeated Phase 3 writes and import re-runs must not duplicate rows. A `@@unique([contactId, kind, value])` constraint is applied where the value is canonicalizable; otherwise the write path dedupes explicitly.
2. **NEW location fields on `Contact`**: `streetAddress`, plus `city`, `stateCode`, `country`, `countryCode` — `Contact` currently has NONE of these (only `Company` has city/stateCode/country/countryCode). This is required by the Phase 2 telia.se case study, which writes the missing country onto a Contact. `Company` gets `streetAddress` too (optional).
3. **NEW enum on `Contact`**: `verificationStatus` (`UNVERIFIED → VERIFYING → NEEDS_HUMAN → VERIFIED`) + `lastVerifiedAt`. Drives dashboard progress + feeds the future cold-calling "verified & reachable" list.
4. **NEW model `LegacyImportMapping`** `{ legacyTable, legacyId, model ('Contact'|'Company'|'ContactMethod'|'Activity'), crmId, unique[legacyTable, legacyId] }` — idempotency + provenance audit trail. Consulted on every insert (see §5).

**Relationship to existing `enrichmentStatus`:** `Contact.enrichmentStatus` (PENDING/RUNNING/COMPLETE/FAILED/SKIPPED) tracks the generic company/contact enrichment pipeline. The verify flow **accepts the existing lane coupling**: verify tasks dispatch through the same research lane, so `markRunning`/`settle(COMPLETE|FAILED)` (dispatch.ts:106, crm.ts:56/69) also advance `enrichmentStatus` as they would for any other task — this is expected, not a bug. `verificationStatus` is the distinct, verify-specific outcome field and is the one the dashboard/cold-calling list reads. The verify flow does not specially guard `enrichmentStatus`; it is simply allowed to move with the task
lifecycle. UI column/filter names the enum explicitly as `verificationStatus` to avoid confusion.

## 5. Import CLI (`bun run import:wamp`)

- **Location:** Bun/TS script in `apps/api` (needs Prisma + queue).
- **Wiring:** `apps/api/package.json` → `"import:wamp": "bun src/import/import-wamp.ts"`; root → `"import:wamp": "bun run --filter=api import:wamp"`.
- **Env/config:** the CLI imports `@crm/env/load` itself to read the root `.env` (it is neither an API nor an agent process, so neither §7 consumer rule applies to it directly — it is a standalone Bun script).
- **Flags:** `--dry-run` (parse + report only), `--limit N` (subset for testing), `--userId <uuid>` (the importing user bound to `Activity.createdById` — a standalone CLI has no sign-in session, so the user is passed explicitly; the CLI refuses to run without it when `--dry-run` is not set).

### SQL reading

No parser dependency. A hand-rolled streaming scanner reads the file line by line (never loads 178 MB into memory), accumulates statements until `;` at EOL outside quotes/backticks (handles multi-line + multi-row tuples). Extracts the 19 `CREATE TABLE` + `INSERT` statements. Values un-escaped with a stateful tokenizer (backtick identifiers, doubled quotes, backslash escapes). A self-check compares parsed row counts against assertions and fails loudly on mismatch.

**Scanner hardening (from review):**
- All writes go through Prisma — no string-built SQL, ever.
- Reject invalid UTF-8 / NUL bytes; cap `notes` (mediumtext) length before storage.
- `notes` will render in the UI as text — React auto-escaping suffices (render as text).

### Mapping execution order (transactional, batched)

1. **Lookups first:** `countries` → match by iso3166 or name (fallback: keep raw string); `statuses` → label; `lists` → tag string; `users` → match **email or name** against existing `User` (else `ownerId` stays null — no stub users).
2. **Companies** from `companies` (active only, `company_type='company'`), dedupe on `domain` when derivable.
3. **Contacts** from `clients`: split name → firstName/lastName, title → title, address → streetAddress, `source = IMPORT`, `verificationStatus = UNVERIFIED`.
4. **ContactMethods** from `client_contacts`: normalize phone digit-strings to E.164 (best effort, canonical flag), label from phone_types; pick primary email → `Contact.email`, primary phone → `Contact.phone`.
5. **Activity** per client: one NOTE Activity with the notes diary as body, `occurredAt = created_at`, `createdById` = the `--userId` flag value (no stub users).
6. **Collision policy:** if `Contact.email` or `Company.domain` already exists, attach legacy methods + diary as Activity to the existing record instead of duplicating — no silent drops.
7. **Idempotency:** every insert (Company/Contact/ContactMethod/Activity) first checks `LegacyImportMapping` for `(legacyTable, legacyId)`; already mapped rows are skipped and counted under "skipped" in the summary. This makes `--dry-run` and full re-runs deterministic and duplicate-free.

### Agent kickoff

The CLI enqueues ONE `AgentTask` per imported contact, `kind: 'verify'`, reason `'imported from legacy WAMP CRM'`. **Priority is weighted by legacy status/list per bucket:** `AgentTriggerService.backfill()` takes a single
priority for the whole batch, so the CLI issues one `backfill` call per priority bucket (`{ kind, reason, contactIds, priority }` — createMany + dedupe against outstanding tasks + `poke()`; the public method is `backfill`, not `queueBackfill`). The import never touches enrichment directly; the eve agent leases and decides.

**Agent wiring for the `verify` kind (required new code, from review):**
- Add `'verify'` to `TASK_KINDS` in `packages/db/src/agent-tasks.ts`.
- Add `case "verify"` to `work()` in `apps/agent/agent/lib/dispatch.ts` (otherwise it falls through to the generic "Handle this: …" branch and the whole verification flow never triggers). **This case must handle BOTH `"verify"` and `"recheck"`** — `schedule_recheck` enqueues kind `"recheck"` (hardcoded) and without this, scheduled re-verification would still fall into the generic profile branch and never run the verify flow.
- Add a `verify` branch to `sessionPreamble` (`apps/agent/agent/lib/preamble.ts`).
- Add `VERIFY` to the `PRIORITY` map in `packages/db/src/agent-tasks.ts`.

### End of run

Prints a summary report: imported / updated / skipped / deduped, lookup misses, E.164 failures, count of verify-tasks queued.

## 6. Agent verification flow (per contact, kind `verify`)

### Phase 0 — Claim & state

Agent leases the task (claimDue / `FOR UPDATE SKIP LOCKED`); sets `Contact.verificationStatus = VERIFYING`. All writes go through the evidence ledger (`ContactFact`); nothing is guessed.

**Write path for status transitions (required new code, from review):** no existing agent tool can set `verificationStatus`/`lastVerifiedAt`. This work adds a tool (e.g. `set_verification_status`) or an agent-events handler that
writes the status + `lastVerifiedAt` under the evidence rules.

### Phase 1 — Presence & format audit (deterministic, offline, no network)

Parse each field: email (domain presence + TLD validity, flag missing/misspelled), phone (E.164 canonicalization attempt, length + country-code validation, flag bare digit strings), address (street? city? country?). One `ContactFact` per field (band VERIFIED/PROBABLE/POSSIBLE, method `'format-audit'`, evidence Json) + one NOTE Activity summarizing the audit.

**Ledger extension + humanOwns guard (required, from review):** `FIELDS`/ `FACT_FIELDS` in `apps/agent/agent/lib/facts.ts` currently only allows `name, title, linkedinUrl, twitterUrl, githubUrl, employer, seniority, function, location, tenure` — `record_fact` rejects anything else, AND its `humanOwns` guard returns early ("A person already filled in X", nothing stored) whenever the target column is already non-empty. Imported contacts always have email/name pre-filled and often phone/address, so:
- **Audit facts must be `column: null`** — a `ContactFact` ledger row with no primary-field write. This keeps Phase 1 "one fact per field" out of the humanOwns guard's path entirely.
- Add `email`, `phone`, `address` (and any new location fields) to `FACT_FIELDS` **for these column:null ledger rows only** and include the new Contact columns in `record_fact`'s contact select (facts.ts:68-80) so the guard sees them.
- **Primary-field writes (Phase 3 APPLIED evidence) do NOT go through `record_fact`** — they go through the new verify/`ContactMethod` write tools, which are exempt from the humanOwns guard by design (imported data + verified evidence, not user-entered values).

### Phase 2 — Identity cross-referencing (offline)

Infer country from email TLD, compare with address country. Match → write missing country/countryCode (on the new `Contact` country fields) as band VERIFIED.

**Canonical case study** (telia.se): profile has correct name, properly spelled physical address, but missing country and only `user@telia.se` — no phone/fax/mobile. The agent infers Sweden from the `se` TLD, checks the address
for a positive country match, updates the missing country (Contact.country/countryCode = Sweden/SE, band VERIFIED), then performs further OSInt research from name + address + email to retrieve phone/fax/mobile — only writing after
cross-referencing a positive match.

### Phase 3 — OSInt fill (network, only for gaps, only what's allowed)

Default policy: **email finding, phone/mobile finding, physical address finding = OK; background checks = only upon user request.**

**This is NEW work, not reuse (from review):** `apps/agent/agent/lib/capabilities.ts` currently knows only `RAPIDAPI_KEY`, `PERPLEXITY_API_KEY`, `CONTEXT_DEV_API_KEY`, `BLOB_READ_WRITE_TOKEN`. There are no Exa/Brave/Tavily/
Firecrawl/Google/DDG capabilities and no research tool consumes them. This work must:
- Add capability entries for Exa / Brave / Tavily / Firecrawl (user holds these keys; more can be added later) following the existing graceful-degradation pattern — missing key removes that source, never throws.
- Add research tools (or extend `research_person`) that consume those keys for contact-detail finding (email/phone/address). Background checks remain gated: the agent only runs them on explicit user request.
- Add the new keys (and `VERIFY_RECHECK_DAYS`) to `apps/agent/turbo.json` dev `passThroughEnv` allow-list (absent today) so they actually reach the agent process.

For each gap: research → candidates → cross-verify (name + address + email alignment) → **positive match required before any write**.

- Strong evidence (2+ independent sources): band VERIFIED, status APPLIED → write/update via the new verify/`ContactMethod` tools (primary Contact fields + ContactMethod rows, canonical E.164, dedupe on write) — **not** `record_fact` (see Phase 1 guard).
- Weak evidence: band POSSIBLE/PROBABLE, status PROPOSED → `verificationStatus = NEEDS_HUMAN`, surfaced in UI for the user to settle (existing decision path; `decidedBy` records it).

### Phase 4 — Close & recheck

Set `lastVerifiedAt`; `verificationStatus = VERIFIED` (if no unsettled gaps) or `NEEDS_HUMAN`. Enqueue re-verification via the existing `schedule_recheck` tool — note `days` is REQUIRED (min 1 / max 730, no default), so the verify
brief reads `VERIFY_RECHECK_DAYS` (default 30) and passes it. The enqueued task is kind `"recheck"`, which the new `work()` verify case handles identically to `"verify"` (§5). Default interval ~30 days so stale profiles re-check —
continuously current "verified & reachable" list feeding the future cold-calling stage. `VERIFY_RECHECK_DAYS` is registered in `.env.example` and `apps/agent/turbo.json` dev `passThroughEnv` (numeric config, not a capability).

### Progress visibility

`verificationStatus` drives a column/filter in the contacts table (labeled explicitly `verificationStatus`); `NEEDS_HUMAN` is the inbox.

## 7. Environment & configuration

New env keys (one root `.env`). **Note: `.env.example` does not exist at the repo root — it must be created as part of this work** and document these keys. Consumer rules: API-consumed keys are declared in `apps/api/src/config/env.validation.ts`; agent-consumed keys are registered in `apps/agent/agent/lib/capabilities.ts` (capabilities only) AND in the `apps/agent/turbo.json` dev `passThroughEnv` allow-list (all of them — that is
what physically reaches the agent process); the import CLI reads the root `.env` via `@crm/env/load` directly.

| Key | Consumed by | Purpose | Required? |
|---|---|---|---|
| `LEGACY_CRM_SQL_PATH` | import CLI (via `@crm/env/load`) | Absolute path to `crm_final.sql` for `bun run import:wamp` | No — missing means import is a no-op with a clear error |
| `VERIFY_RECHECK_DAYS` | agent (verify brief / schedule_recheck `days`) | Re-verification interval (default `30`) | No — sensible default |
| `EXA_API_KEY`, `BRAVE_API_KEY`, `TAVILY_API_KEY`, `FIRECRAWL_API_KEY` | agent (Phase 3 tools) | OSInt contact-detail sources | No — graceful degradation |

Missing key = that source drops out, never throws.

## 8. Out of scope

- Cold-calling / VoIP / SIP integration (later stage, feeds from the "verified & reachable" list)
- `client_shares` / `stocks` portfolio import
- Background checks (only upon explicit user request)
- Multi-tenancy

## 9. Open items / deferred decisions

- Whether `streetAddress`/location fields are added to `Company` as well (decided: `Company.streetAddress` added; `Company` already has city/stateCode/country/countryCode).
- Diary-entry splitting of legacy `notes` (deferred; raw preserved).
- Exact name of the new verify/ContactMethod write tool(s) (named in implementation; spec constrains behavior, not identifier).
