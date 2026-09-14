# Project Assessment — `F:\crm`

**Date:** 2026-09-13
**Scope:** Entire repository `F:\crm` (Turborepo monorepo)
**Method:** Full read of project-authored Markdown, code inventory via filesystem + grep, one typecheck run
**Author:** Assessment pass, read-only except for this report

---

## 1. Executive summary

`F:\crm` is an **agentic-first CRM**: a durable research agent is the product and the database is where it writes. It is a fork/adaptation of `trycompai/crm`, rebuilt as a Docker-free Turborepo on Bun with a NestJS + tRPC API, a Next.js App Router frontend, Prisma/Postgres and an `eve`-based agent deployment.

The project has **substantially outgrown its own written plans**. The two `crm-plan` documents (a 7-phase and an 11-phase version) describe a conventional enriched CRM; the repository now contains six further subsystems that were never in those phases — contact-intelligence v2, Gmail/Calendar sync, people enrichment, VoIP voice calling, OSINT and workspace/SSO/organisation. Delivery has been driven by a newer set of feature plans in `docs/plan/`.

**Health is good.** `bun run check-types` passes **10/10 tasks** (30.7 s) once a harness-level Node shim is bypassed. There are **43 project test files** across `apps/*` and `packages/*`. The last commit is `b9404a0` (2026-09-12).

**The one workstream that is genuinely mid-flight — and currently broken in the middle — is the legacy WAMP import + agent verification effort.** Schema, migration, environment, task registry and agent-prompt wiring are complete but **uncommitted**. The two tools the agent prompt instructs the model to call (`set_verification_status`, `set_contact_methods`) **do not exist**, the streaming import CLI **does not exist** and the UI **does not surface verification state**. As written today, the verify flow would instruct the agent to call a missing tool.

**There is no single finish line.** Completion is six tracks, of which two are in-repo and product-critical, two are hardening, one is a separate repository and one is hygiene.

---

## 2. What the project is

| Layer | Technology |
|---|---|
| Monorepo | Turborepo 2.10.12 on Bun, deployed to Vercel |
| Agent | `eve` — durable sessions, tools, skills, schedules, sandbox |
| Model | Vercel AI Gateway, plus optional local/hosted providers |
| Sandbox | Vercel Sandbox (prod), microsandbox (local), **deny-all egress** |
| Frontend | Next.js 16 App Router · shadcn/ui · nuqs (URL state) |
| API | NestJS + `nestjs-trpc` — HTTP, auth, tRPC, Google sync |
| Data | Prisma · Postgres (pooled + direct) |
| Auth | Better Auth, Google sign-in, one allow-list, `admin` RBAC plugin |
| Files | Vercel Blob |

**Workspaces:** `apps/agent`, `apps/api`, `apps/app`, `packages/{auth,db,env,typescript-config,ui}`.

**Three house rules the codebase holds to** (README, AGENTS.md):
1. Intelligence never lives in the API — Nest reports that *something happened*; the agent decides what it means.
2. `packages/ui` is the only source of UI.
3. Single tenant, no organizations (now relaxed — see §5).

---

## 3. Evidence base and method

Read in full: `README.md`, `AGENTS.md`, `CHANGES.md`, `crm_documentation_summary.md`, `execution_plan_summary.md`, `docs/crm-plan.md` (998 lines), `docs/plan/crm-plan.md`, `docs/plan/contact-intelligence-agent.md` (725 lines), `docs/plan/gmail-calendar-plan.md` (821 lines), `docs/plan/people-enrichment-agent.md` (451 lines), `integration_plan.md`, `integration_roadmap.md`, `docs/handoff-wamp-crm-import.md`, `docs/changes/2026-09-11.md`, `adrs/*`, `scripts/IMPORT_SUMMARY.md`.

Inventoried: Prisma schema (33 models, 16 enums, 21 migrations), API modules/routers, app routes, agent tools/skills/schedules/lib, test files, git state.

**Commands run and their side effects (disclosed):**
- `bun run check-types` (after clearing `NODE_OPTIONS`) — **passed 10/10**. Turbo's task graph also ran `@crm/db:build` (`prisma generate`), `api:build` (created `apps/api/dist/`, gitignored) and `api:trpc:generate` (rewrote `apps/api/src/generated/server.ts` with identical content — **git reports it unmodified**).
- No source file was edited by this assessment.

---

## 4. Current state by subsystem

### 4.1 Core CRM — **substantially complete**

| Area | Evidence |
|---|---|
| Data model | `Company`, `Contact`, `Deal`, `DealContact`, `Activity`, `CompanyEnrichment`, `ContactMethod` |
| API | `companies`, `contacts`, `deals`, `activities`, `dashboard`, `search`, `settings`, `users` routers |
| UI | List pages + detail pages for all three objects; visual query builder; timeline; record sheets; stage stepper; quick switcher |
| Enrichment | `Context.dev` brand enrichment + research, avatar mirroring |

**Divergence from the master plan:** the elaborate model in `docs/crm-plan.md` §4–§5 (many-to-many `CompanyContact`/`CompanyDeal`/`AssociationLabel`, the `PropertyDefinition` registry, `SavedView`, `Attachment`) was **not built**. None of those models exist. The shipped design follows the simpler `docs/plan/crm-plan.md` model: `Contact.companyId` single-company, `Company.primaryContactId`, `DealContact` only. Consequently there is **no** `properties`, `savedViews`, `associations` or `attachments` router. This looks like a deliberate simplification, not an omission — but it is not recorded as a decision anywhere.

### 4.2 The agent (`apps/agent`) — **complete and well beyond the plan**

| Item | Planned | Actual |
|---|---|---|
| Tools | 18 | **30** |
| Skills | 4 | **20** (4 core + 16 dev) |
| Schedules | 1 | 1 (`dispatch.ts`) |
| Sandbox | yes | yes, deny-all egress |
| Channels | — | `eve`, `crm`, `voice` |
| Hooks | — | `audit`, `activity` |
| Commands | — | `add-context`, `improve-agent`, `multi-agent-optimize` |

Tools include: CRM read/search/identify, enrichment, evidence (`record_fact`, `write_brief`, `record_job_change`), scheduling (`schedule_recheck`, `list_outstanding_work`), socials/photo, **voice** (`make_call`, `answer_call`, `transfer_call`, `end_call`, `call_status`, `schedule_calls`, `record_call_outcome`) and **OSINT** (`flag_for_osint`, `get_osint_queue`, `mark_osint`).

### 4.3 Contact intelligence v2 — **phases 1–4 and 6 complete**

`ContactFact`, `ContactBrief`, `AgentEvent`, `AgentConversation`, `AgentTask` all exist; `apps/agent/agent/lib/evidence.ts`, `facts.ts` implement the weighted ledger; `apps/app/components/crm/facts.tsx`, `agent-panel.tsx`, `agent-conversations.tsx` implement the provenance UI; `apps/app/app/eve/v1/[...path]/route.ts` is the same-origin live-panel proxy.

`docs/plan/contact-intelligence-agent.md` §14 confirms phases 1–4 (2026-08-01) and phase 6 (2026-08-01) landed.

**Still open from that plan:** phase 5 (background panel sections/tenure/colleagues), phase 7 (dynamic scheduling — `AgentTask` + dispatcher exist but no `plan_research` tool or subagent fan-out), phase 8 (meeting-prep briefs), phase 9 (job-change supersession → activity + owner task).

### 4.4 Gmail & Calendar sync — **phases 1–3 complete**

Models `MailboxSync`, `EmailThread`, `EmailMessage`, `CalendarEvent`, `CalendarAttendee`, `SuppressedDomain`; `apps/api/src/google/` has `gmail-sync`, `calendar-sync`, `google-match`, `google-token`, `sync-state`, `sync.controller`; UI has `email-thread-entry.tsx`, `meeting-entry.tsx`, `sync-status.tsx`, settings → connections.

**Still open:** phase 4 (auto-create companies/contacts from unknown work domains — partially present via `RecordSource` + `SuppressedDomain`), phase 5 (optional real-time via `users.watch`).

### 4.5 Workspace / SSO / organisation — **added, undocumented as a plan**

`Organization`, `WorkspaceProfile`, `Member`, `Invitation`, `SsoProvider` + `workspace` and `sso` routers + settings pages (`members`, `sso`, `connections`). This **contradicts the original "no organizations" rule**; `docs/api.md` has since been updated to "There is exactly one organization and it is not a tenancy boundary." The rule evolved but no plan or ADR records why.

### 4.6 Voice calling — **added, undocumented as a plan**

`Call`, `CallEvent` models; `CallDirection`, `CallStatus`, `CallOutcome`, `CallEventType` enums; 7 voice tools; `apps/agent/agent/lib/voice.ts`; `.env.example` documents `VOIPSTUDIO_*` and Kokoro TTS; `voice-recordings/` directory exists. A `voice-pipeline-poc` session is staged in `.tmp/`.

### 4.7 OSINT — **added**

`OsintTarget` model + `OsintStatus` enum; `packages/db/src/viability.ts` (weighted scoring for the Germany/Switzerland pilot); three OSINT agent tools.

### 4.8 Legacy CRM import + verification (WAMP) — **in flight, uncommitted, broken in the middle**

This is the active workstream, described in `docs/handoff-wamp-crm-import.md` as WS0–WS9.

| Step | Status | Evidence |
|---|---|---|
| WS1 Prisma | **Done** | `ContactMethod`, `LegacyImportMapping`, `ContactVerificationStatus`, `Contact.verificationStatus`/`lastVerifiedAt`; migration `20260912000000_wamp_import_verification` (untracked) |
| WS2 Task registry | **Done** | `verify` in `TASK_KINDS`; `verify: 60` in `PRIORITY` (`packages/db/src/agent-tasks.ts`) |
| WS3 Env | **Done** | root `.env.example` (+9 lines, untracked diff); `LEGACY_CRM_SQL_PATH`, `VERIFY_RECHECK_DAYS`; `env.validation.ts` (+4) |
| WS4 Verify plumbing | **Done** | `dispatch.ts` `case "verify"`; `preamble.ts` `verifyFlow`/`verificationStatus`/`verifyRecheckDays` (+30) |
| WS5 Verify tools | **NOT DONE** | `set_verification_status.ts` and `set_contact_methods.ts` **do not exist** in `apps/agent/agent/tools/` |
| WS6 Guidance | **Partial** | `preamble.ts:317–322` writes the four-phase brief |
| WS7 Import CLI | **NOT DONE** | `apps/api/src/import/` absent; no `import:wamp` script in `apps/api/package.json` |
| WS8 UI | **NOT DONE** | no `verificationStatus`/`NEEDS_HUMAN` reference in contacts table or `contact-sheet.tsx` |
| WS9 E2E | **NOT DONE** | no `apps/api/test/import-wamp.spec.ts` |

**Critical defect:** `apps/agent/agent/lib/preamble.ts:317` tells the agent *"Claim it with `set_verification_status` before anything else"* and lines 319/322 instruct writes through `set_contact_methods`. Neither tool exists, so the verify flow as wired cannot complete.

**Note:** `packages/db/scripts/import-legacy.ts` + `scripts/IMPORT_SUMMARY.md` are a *different*, earlier mechanism — CSV dumps into a `crm_legacy` Postgres schema (22 tables, ~210k `legacy_map` rows). It is not the WAMP MySQL-dump streaming import WS7 specifies.

---

## 5. Plan vs reality — drift register

| # | Drift | Impact |
|---|---|---|
| D1 | Master plan §4–§5 (M2M associations, custom-property registry, saved views, attachments) not built | The two plan documents disagree with each other and with the code. Anyone onboarding from `docs/crm-plan.md` will look for models and routers that do not exist. |
| D2 | "No organizations" rule reversed; `Organization`/`WorkspaceProfile`/`SSO` added | Documented in `api.md` after the fact, but no plan or ADR records the decision. |
| D3 | Voice calling, OSINT, workspace/SSO have **no plan document** | These are the largest undocumented surfaces in the repo. |
| D4 | README says "18 authored tools / 4 skills"; actual is 30 / 20 | README is the public face and is stale. |
| D5 | `AGENTS.md` still refers to `docs/review.md` in older plans; the file does not exist | Current `AGENTS.md` no longer references it — effectively resolved, but the plans still do. |
| D6 | Root `execution_plan.md`, `execution_plan_summary.md`, `execution_plan_synthesis.md`, `crm_documentation_summary.md` | These are **artifacts of a different agent session** about a voipstudio CTI integration, produced from a Linux container that could not access `F:\crm`. They are untracked, describe the repo as inaccessible and are not project documentation. They pollute the repo root. |
| D7 | `integration_plan.md` / `integration_roadmap.md` | These describe porting the CRM agent into **`F:\theseas`**, a different repository. They are not work in this repo. |
| D8 | `apps/agent/dbping.tmp.ts`, `.serena/`, `.tmp/`, `__pycache__/` | Scratch/untracked artifacts present in the working tree. |

---

## 6. Remaining work to completion — six tracks

### Track A — WAMP import + verification (in-repo, in flight, highest priority)

| # | Task | Detail |
|---|---|---|
| A1 | **`set_verification_status` tool** | Claim → `VERIFYING`; close → `VERIFIED`/`NEEDS_HUMAN`. Mirror `personForVerification` in `set_contact_socials.ts`. **Unblocks the dangling prompt reference.** |
| A2 | **`set_contact_methods` tool** | VERIFIED-band email/phone writes (imported values are prefilled, not human-entered, so `record_fact`'s `humanOwns` guard must be bypassed). |
| A3 | **Import CLI** `apps/api/src/import/import-wamp.ts` | Streaming SQL scanner (semicolon-at-EOL outside quotes), lookup → company → contact → contact-method → NOTE activity mapping, `LegacyImportMapping` provenance, idempotent, one `verify` AgentTask per contact. Flags `--dry-run`, `--limit`, `--userId`. Add `import:wamp` script. |
| A4 | **Import test** `apps/api/test/import-wamp.spec.ts` | Fixture SQL; asserts UNVERIFIED counts, malformed-row warning without crash, second run idempotent. |
| A5 | **UI** | Verification badge + status column + "Needs human review" filter on the contacts table; status + `lastVerifiedAt` on the contact sheet. |
| A6 | **End-to-end** | Real import → rows + mappings + queued tasks → agent verifies → statuses land → UI queue. |
| A7 | **Commit** | The whole workstream is currently uncommitted; `git status` shows 8 modified files + the migration directory. |

### Track B — Contact intelligence v2, remaining phases

- **B1 (phase 5)** Background panel: structured sections, tenure, "we know them" from Gmail/Calendar, colleagues.
- **B2 (phase 7)** Dynamic scheduling: `plan_research` tool, subagent fan-out, agent-authored cadences. (`AgentTask` + dispatcher already exist.)
- **B3 (phase 8)** Meeting-prep briefs for calendar events with external attendees.
- **B4 (phase 9)** Job changes: superseding facts raise an activity + owner task. (`record_job_change` exists; supersession wiring is unverified.)

### Track C — Gmail & Calendar, remaining phases

- **C1 (phase 4)** Auto-create rules for unknown work domains, filters, bulk undo, toggles — must not ship before phase 3 has run on real mailboxes for a week (plan's own constraint).
- **C2 (phase 5, optional)** Real-time via `users.watch` + Pub/Sub push.

### Track D — Production readiness

- **D1** No Vercel projects exist; Blob store `crm-attachments` created but not attached (`docs/crm-plan.md` §14).
- **D2** Pooled `DATABASE_URL` + `DIRECT_URL` provider not chosen.
- **D3** `CRON_SECRET` + scheduler for `POST /internal/sync/google` not confirmed configured.
- **D4** Commit the generated `apps/api/src/generated/server.ts` alongside any router change.

### Track E — Cross-project S.E.A.S. port (**outside this repo**)

`integration_roadmap.md`: port the agent's capabilities into `F:\theseas` (Python). Phase 1 is 3/4 done (`crm_repository.py` missing); phases 2–7 not started. ~4 weeks estimated. **This is not `F:\crm` work** and should be tracked separately.

### Track F — Repository hygiene

- **F1** Delete or relocate the stray root `execution_plan*.md` and `crm_documentation_summary.md` (D6).
- **F2** Update README tool/skill counts (D4).
- **F3** Write the missing plan/ADR for voice, OSINT and workspace/SSO (D2, D3).
- **F4** Reconcile or retire `docs/crm-plan.md` vs `docs/plan/crm-plan.md` (D1).
- **F5** Remove `apps/agent/dbping.tmp.ts` and `__pycache__/`; decide on `.serena/`.

---

## 7. Risks and blockers

| Risk | Severity | Note |
|---|---|---|
| **Dangling tool reference** (`set_verification_status`) | **High** | The verify prompt cannot succeed as wired. Any WAMP import would enqueue tasks that fail at the first step. |
| WAMP work is uncommitted | **High** | 8 modified files + an untracked migration. A bad reset loses the entire workstream. |
| Duplicated intelligence (API vs agent) | Medium | `docs/plan/contact-intelligence-agent.md` §0 documents two LinkedIn clients and two identity matchers that **already drifted**; §10 says delete `apps/api/src/enrichment/`. Partially done. |
| Sandbox egress / credentials | Medium | Deny-all egress is the mitigation; it holds only if nobody adds `DATABASE_URL` to the sandbox env. |
| Single-provider LinkedIn | Medium | `lib/linkdapi.ts` is the only file that knows the vendor — swap is a day, not a rewrite. |
| `eve` is in preview | Medium | Framework APIs may change before GA; vendor-shaped code is isolated in `apps/agent/lib/`. |
| Plan/document drift | Medium | Three plan documents, two of them contradictory, plus undocumented subsystems. |
| No deployment | Medium | Nothing is deployed; Vercel projects, blob attachment and pooled DB are all outstanding. |

---

## 8. Health signals

| Signal | Result |
|---|---|
| `bun run check-types` | **PASS — 10/10 tasks, 30.7 s** |
| `api:trpc:generate` | **PASS — 12 routers, 52 procedures** |
| Project test files | **43** (agent 19, api 10, app 5, auth 4, db 3, env 2) |
| Prisma models / enums / migrations | 33 / 16 / 21 |
| Agent tools / skills / schedules | 30 / 20 / 1 |
| Last commit | `b9404a0` — 2026-09-12 |
| Uncommitted changes | 8 modified + 1 untracked migration + scratch artifacts |
| `reports/` | empty before this report |

**Environment caveat:** `bun`/`node` inherit `NODE_OPTIONS=--import=...headroom.../handler.js`, which throws `Headroom OpenCode transport shim loaded without HEADROOM_OPENCODE_TRANSPORT_PROXY_URL` in every child process. Any build or test run fails until `NODE_OPTIONS` is cleared for that command. This is a harness issue, not a project defect — but it will make CI-style verification fail confusingly.

---

## 9. Final assessment

**The project is in good health and is significantly more complete than its documentation claims.** The core CRM, the agent, contact intelligence v1–v4/v6 and Gmail/Calendar sync are built, typecheck-clean and tested. The engineering quality is high: the codebase has explicit invariants, an evidence ledger rather than model self-confidence, deny-all sandbox egress and tests that pin security-critical behaviour (token verification, lane leases, evidence bands).

**Completion, however, is not one finish line.** Three observations matter most:

1. **The active workstream is broken in the middle.** The WAMP verification flow is wired end-to-end in schema, queue and prompt — but the two tools the prompt names do not exist, the importer does not exist and the UI does not show the result. This is the highest-value, lowest-ambiguity work available: roughly **1–2 focused sessions** to make the flow actually run.

2. **The documentation no longer describes the system.** Three overlapping plan documents, two of which contradict the code, plus three large undocumented subsystems (voice, OSINT, workspace/SSO). This is a real onboarding and maintenance risk and is cheap to fix.

3. **Nothing is deployed.** The Vercel projects, blob attachment and pooled database are all outstanding, so "completion" in the sense of *running for a user* is further away than the code suggests.

**Recommended definition of done for the in-repo product:**
Track A complete and committed → Track B1–B2 → Track D1–D3 → Track C1 → Track F1–F4.
Tracks B3–B4, C2 and E are follow-on, not blockers.

---

## Appendix A — project document inventory

**Root:** `README.md`, `AGENTS.md`, `CHANGES.md`, `INSTALL.md`, `SECURITY.md`, `crm_documentation_summary.md`*, `execution_plan.md`*, `execution_plan_summary.md`*, `execution_plan_synthesis.md`*, `integration_plan.md`†, `integration_roadmap.md`†, `deploy_eve_chat_agent.txt`*
**`docs/`:** `crm-plan.md`, `agent.md`, `api.md`, `design.md`, `environment.md`, `handoff-wamp-crm-import.md`
**`docs/plan/`:** `crm-plan.md`, `contact-intelligence-agent.md`, `gmail-calendar-plan.md`, `people-enrichment-agent.md`
**`docs/plans/` + `docs/specs/`:** `2026-08-05-wamp-crm-import.md`, `2026-08-05-wamp-crm-import-design.md`
**`docs/changes/`:** `2026-09-11.md`
**`adrs/`:** `README.md`, `comp-palette.md`
**`scripts/`:** `IMPORT_SUMMARY.md`
**Per-package:** `apps/{agent,api}/README.md`, `packages/{auth,db}/README.md`

\* artifact of a different session (see D6) · † describes another repository (see D7)

## Appendix B — code inventory

**API routers (12 / 52 procedures):** activities, companies, contacts, conversations, dashboard, deals, google, search, settings, sso, users, workspace
**Prisma models (33):** User, Session, Account, Verification, RateLimit, Company, CompanyEnrichment, Contact, ContactMethod, LegacyImportMapping, ContactFact, ContactBrief, AgentTask, AgentEvent, AgentConversation, Deal, DealContact, Activity, MailboxSync, EmailThread, EmailMessage, CalendarEvent, CalendarAttendee, SuppressedDomain, AppSetting, Organization, WorkspaceProfile, Member, Invitation, SsoProvider, Call, CallEvent, OsintTarget
**Agent tools (30):** read_crm_history, search_crm, identify_contact, research_person, enrich_company, record_fact, schedule_recheck, read_company_history, read_deal_history, fetch_contact_photo, find_contact_socials, get_contact_work_history, record_job_change, set_contact_socials, write_brief, write_workspace_profile, resolve_linkedin_profile, get_linkedin_profile, research_company, list_outstanding_work, get_osint_queue, flag_for_osint, mark_osint, make_call, answer_call, transfer_call, end_call, call_status, schedule_calls, record_call_outcome
**App routes:** dashboard, companies(+`[companyId]`), contacts(+`[contactId]`), deals(+`[dealId]`), settings/{connections,members,sso}, (auth)/{sign-in,onboarding,grant-access}
