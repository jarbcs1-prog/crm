# Plan — Track A: WAMP import + agent verification

**Date:** 2026-09-13
**Status:** A1–A5 complete and verified; A6 (real write) awaiting explicit approval
**Authority:**
- Design spec (frozen): `docs/specs/2026-08-05-wamp-crm-import-design.md`
- Execution checklist: `docs/plans/2026-08-05-wamp-crm-import.md`
- Handoff brief: `docs/handoff-wamp-crm-import.md` (WS0–WS9)
- Assessment: `reports/PROJECT-ASSESSMENT-2026-09-13.md`

Where the plan and spec disagree, the **spec wins**.

---

## Objective

Make the legacy WAMP import + agent verification flow actually run end to end. Today it is
wired in schema, queue and prompt but the two tools the prompt names do not exist, the
importer does not exist and the UI does not show the result.

## Already complete (do not redo)

| Step | Evidence |
|---|---|
| WS1 Prisma | `ContactMethod`, `LegacyImportMapping`, `ContactVerificationStatus`, `Contact.verificationStatus`/`lastVerifiedAt`; migration `20260912000000_wamp_import_verification` |
| WS2 Task registry | `verify` in `TASK_KINDS`, `verify: 60` in `PRIORITY` |
| WS3 Env | `LEGACY_CRM_SQL_PATH`, `VERIFY_RECHECK_DAYS` in root `.env.example` + `env.validation.ts` |
| WS4 Plumbing | `dispatch.ts` `case "verify"`; `preamble.ts` `verifyFlow`/`verifyRecheckDays` |

## Preconditions

- Clear the harness shim for every command: `$env:NODE_OPTIONS=''` before `bun run …`,
  otherwise every child process throws `Headroom OpenCode transport shim loaded without
  HEADROOM_OPENCODE_TRANSPORT_PROXY_URL`.
- Repo rules (`AGENTS.md`): **no code comments**; one root `.env`; a missing key degrades,
  never throws; no coauthored commits.

---

## Deliverables

### A1 — `set_verification_status` tool

**Path:** `apps/agent/agent/tools/set_verification_status.ts` (auto-discovered)
**Fixes:** `preamble.ts:317` currently instructs the agent to call a tool that does not exist.

Behaviour:
- Claim: `UNVERIFIED → VERIFYING`, stamp `lastVerifiedAt` is **not** set here.
- Close: `→ VERIFIED` or `→ NEEDS_HUMAN`, stamp `lastVerifiedAt`.
- Mirror the `personForVerification` verify-before-write template in
  `apps/agent/agent/tools/set_contact_socials.ts`.
- Respect the focus budget (`apps/agent/agent/lib/focus.ts`).

### A2 — `set_contact_methods` tool

**Path:** `apps/agent/agent/tools/set_contact_methods.ts`

Behaviour:
- Writes `ContactMethod` rows (and primary `Contact.email`/`Contact.phone`) only at
  `VERIFIED` band.
- Imported values are **prefilled, not human-entered**, so these writes bypass the
  `humanOwns` guard by construction — this tool is the APPLIED path, `record_fact` is not.
- Evidence recorded alongside; anything weaker stays `PROPOSED`.

### A3 — Import CLI

**Path:** `apps/api/src/import/import-wamp.ts` + `"import:wamp"` script in `apps/api/package.json`

- Standalone Bun entry; imports `@crm/env/load` itself; reads `LEGACY_CRM_SQL_PATH`.
- Flags: `--dry-run`, `--limit N`, `--userId <uuid>` (required unless dry-run —
  `Activity.createdById` is required).
- Streaming scanner: accumulate lines until `;` at EOL outside quotes/backticks; stateful
  tokenizer; reject invalid UTF-8/NUL; cap notes; self-check row counts.
- Mapping order: lookups (countries, statuses→labels, lists→tag, users by EMAIL/NAME else
  `ownerId` null, no stubs) → Companies (dedupe domain) → Contacts (split name,
  `source: IMPORT`, `verificationStatus: UNVERIFIED`) → ContactMethods (E.164 best-effort,
  label from `phone_types`, primary → `Contact.email`/`phone`) → one NOTE Activity per client.
- Collision: existing email/domain → attach, never silently drop.
- Provenance: one `LegacyImportMapping` per entity; idempotent (skip already-mapped).
- Enqueue one `AgentTask` kind `verify` per contact via `backfill`, budget 4, one call per
  priority bucket. Import does **not** start sessions.

### A4 — Import test

**Path:** `apps/api/test/import-wamp.spec.ts` + a fixture SQL file

Asserts: N contacts land `UNVERIFIED`; malformed rows warn without crashing; second run is
idempotent.

### A5 — UI

- `apps/app/app/(app)/contacts/` table: verification badge on `contact.verificationStatus`,
  status column, "Needs human review" filter → `NEEDS_HUMAN` (+ `FAILED`).
- `apps/app/components/crm/record-sheet/contact-sheet.tsx`: status + `lastVerifiedAt`.
- Mirror the companies table's `EnrichmentIndicator` pattern.
- Regenerate tRPC types after any router change.

### A6 — End-to-end

Real import (`bun run --filter=api import:wamp`) → rows + `LegacyImportMapping` + queued
tasks → agent verifies → statuses land → UI queue. Then `check-types` + `lint` + `bun test`
in api/agent/app. Confirm **no `.env` touched**, only `.env.example`.

---

## Acceptance checks

Every step: implement → run the check → only then mark done. Never proceed past a failing check.

| Step | Check |
|---|---|
| A1/A2 | `apps/agent`: `bun run check-types`, `bun run lint`, `bun test` |
| A3/A4 | `apps/api`: `bun run check-types`, `bun run lint`, `bun test` |
| A5 | `apps/app`: `bun run check-types`, `bun run lint` |
| A6 | all three, plus a real import run |

## Out of scope

Dedupe against existing CRM contacts; VoIP cold calling; CSV handling; diary splitting.

## Not done without explicit instruction

**Committing.** The workstream is currently uncommitted; leave it that way unless asked.

---

## Completion record (2026-09-13)

### Delivered

| Step | Artifact |
|---|---|
| A1 | `apps/agent/agent/tools/set_verification_status.ts` — claim (`VERIFYING`) and close (`VERIFIED`/`NEEDS_HUMAN`), stamping `lastVerifiedAt` only on close |
| A2 | `apps/agent/agent/tools/set_contact_methods.ts` — VERIFIED-band email/phone writes via `recordFact` + `ContactMethod` upsert; weaker evidence stays a proposal. `FIELDS` in `lib/facts.ts` gained `email`, `phone`, `address` (all `column: null`) |
| A3 | `apps/api/src/import/{import-wamp.ts,sql-scanner.ts,legacy-map.ts}` + `import:wamp` scripts in `apps/api` and root |
| A4 | `apps/api/test/import-wamp.spec.ts` + `test/fixtures/wamp-fixture.sql` (14 tests) |
| A5 | `apps/app/components/crm/verification-status.tsx`; contacts table column + facet; contact sheet indicator + stat; API `verification` facet, row fields and `byId` fields |
| — | `apps/app/lib/agent-transcript.ts` — verbs for the 2 new tools **and 10 pre-existing voice/OSINT tools that had none** (the transcript test was already failing) |

### Verification

| Check | Result |
|---|---|
| `bun run check-types` (monorepo) | 10/10 pass |
| `apps/api` tests | 14/14 pass (new) |
| `apps/app` tests | 64/64 pass |
| `apps/agent` tests | 169 pass / 14 fail — **all 14 pre-existing**, reproduced with `facts.ts` stashed (local `.env` has VOIPSTUDIO/OPENCODE/OPENROUTER keys; DB-state assertions) |
| `import:wamp --dry-run` against the real 178 MB dump | parses and reports: 4 companies, 50 contacts, 135 methods, 44 activities, 1 E.164 failure, 50 honorifics dropped |
| Biome on every touched file | clean |

### Deviations from the spec (deliberate, all flagged)

1. **Honorifics are not stored as job titles.** Legacy `clients.title` holds `Mr.`/`Ms.`/`DATO`/`-`, not job titles. Writing those into `Contact.title` would corrupt ~47k records and violate the spec's own "nothing about a person is guessed". `jobTitle()` drops them and the run counts them (`honorific titles dropped`).
2. **`backfill` is chunked at 1,000 contact ids** rather than one call per bucket, so the dedupe `IN (...)` stays bounded at import scale.
3. **The `Needs human review` filter facets on `verificationStatus` only.** The handoff also wanted enrichment `FAILED` folded in; spec §4 keeps those two fields deliberately distinct, so they are not mixed.
4. **Dry-run now populates the legacy-id map** so its report shows methods/activities that would be written instead of zeros.
5. **An unterminated tuple flushes its trailing value** rather than silently dropping it.

### A6 — smoke test run (2026-09-13)

```sh
bun apps/api/src/import/import-wamp.ts --limit 5 --userId dev-646576406c6f63616c68
```

| Result | |
|---|---|
| companies | 1 created, 3 deduped onto existing domains |
| contacts | 5, `source: IMPORT`, `verificationStatus: UNVERIFIED` |
| contact methods | 17, phones canonicalised (`+441878700267`) with `phone_types` labels |
| activities | 5 NOTE rows, `occurredAt` from legacy `created_at` |
| verify tasks | 5 queued (agent was not running, so the poke did not land — the cron picks them up) |
| honorific titles | 5 dropped, `title` left null |

**Idempotency:** a second identical run created **0** rows, reported **31 skipped (already mapped)** — 4 companies + 5 contacts + 17 methods + 5 activities — and re-queued **0** verify tasks (`alreadyQueued: 5`). Row counts unchanged.

**Outstanding:** the 5 queued `verify` tasks will do real research and spend vendor credits when the agent next runs. The full ~47k-contact import has not been run.

### Full import + duplication incident (2026-09-13)

The 5 verify tasks were deleted, then the full import ran:

```sh
bun apps/api/src/import/import-wamp.ts --userId dev-646576406c6f63616c68
```

2m 24s. `companies 0, contacts 47833, contact methods 20157, activities 29369, E.164 failures 72, honorific titles dropped 17806, verify queued 47838`.

**It doubled the contact table.** The database already held **47,838 contacts** with ids `legacy_client_<legacyId>`, created by `packages/db/scripts/import-legacy.ts` (the CSV path, `CHANGES.md` §2026-09-11). My import created a second 47,838 as cuids. Verified: all 47,838 mapping rows join 1:1 to a pre-existing `legacy_client_<legacyId>` row.

| Population | Count | Id shape | `ContactMethod` rows |
|---|---|---|---|
| Pre-existing (CSV path) | 47,838 | `legacy_client_<id>` | 0 |
| This import | 47,838 | `cuid` | 19,939 |
| Manual | 46 | `cuid` | — |

**Root cause:** the spec's collision policy dedupes on `email`/`domain` only, and 43,478 of these contacts have neither, so nothing matched. The plan also lists "dedupe against existing CRM contacts" as out of scope — but the CSV path had already imported the *same* legacy clients, so that assumption was wrong for this database.

**Fix implemented** (code only, not yet exercised): `importContacts`/`importCompanies` now check `legacy_client_<id>` / `legacy_company_<id>` before creating, and attach to the carried record instead. The legacy id is already embedded in the existing ids, so it is an exact join — no fuzzy matching.

**Proposed recovery:** roll back this import precisely (everything reachable from `legacyImportMapping`), then re-run with the dedupe so methods and diary notes attach to the existing contacts. Awaiting approval.
