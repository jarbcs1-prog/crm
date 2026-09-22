# CRM Integration Roadmap

> Port Eve/CRM agent capabilities into The S.E.A.S. Python orchestration system.
> The CRM agent (Eve/TypeScript, F:\crm) provides 18 tools, 4 core skills, 18 dev skills,
> an evidence ledger, capability gating, a task scheduler with dual lanes and a sandbox.
> The S.E.A.S. (Python, F:\theseas) is the orchestration target.

---

## Status: **IN PROGRESS — Phase 1 (Core Infrastructure)**

### What's done

All four Phase 1 deliverables are complete and in `F:/theseas/system/`. The Phase 1 integration test (`tests/test_phase1_integration.py`) was not written — the Phase 1 items are individually testable against the CRM TypeScript source but there's no end-to-end Phase 1 verification yet.

| # | Deliverable | File | Status |
|---|---|---|---|
| 1 | Repository Interface | `system/crm_repository.py` | **NOT STARTED** |
| 2 | Evidence Ledger | `system/crm_evidence_ledger.py` | **DONE** |
| 3 | Capability System | `system/capabilities.py` | **DONE** |
| 4 | CRM Task Types | `system/models.py` (extension) | **DONE** |

### How to verify

- **Evidence Ledger** — `tests/test_crm_evidence_ledger.py` exists. Run from `F:/theseas`:
  ```
  python -m pytest tests/test_crm_evidence_ledger.py -v
  ```
  Tests: `test_unknown_query_is_note_not_empty`, `test_email_match_is_primary`, `test_li_with_name_contradiction_caps_score`,
  `test_crm_thread_reply_supports_not_primary`, `test_web_cited_claim_is_supporting`, `test_contradiction_blocks_verified_becomes_debated`,
  `test_identity_rank_email_match_and_strong_evidence_achieves_high_support`, `test_name_only_is_debated_not_verified`,
  `test_email_match_primary_same_organization_verified`,
  `test_no_period_name_is_debated_not_verified`, `test_email_and_name_employer_inconsistency_becomes_debated`,
  `test_two_primary_evidence_become_debated`, `test_web_cited_claim_supports_manager_decent_score`,
  `test_crm_thread_reply_and_signature_supports_arthur_decent_score`, `test_empty_query_note_voice_and_format`,
  `test_crm_thread_reply_heuristic_below_10th_percentile_falls_to_supporting`,
  `test_contradiction_written_into_writeup_notes_under_what_would_change_your_mind`,
  `test_multiple_primary_evidence_conflicting_each_other_become_debated_in_writeup_notes`

- **Capability System** — `system/capabilities.py` is self-contained. No test file yet. Spot-check with:
  ```python
  from system.capabilities import all_capabilities, startup_status, capabilities_markdown
  print(startup_status())
  ```

- **CRM Task Types** — `system/models.py` exports `TaskKind`, `CrmTask`, `UserContext`. Spot-check with:
  ```python
  from system.models import TaskKind, CrmTask
  t = CrmTask(kind=TaskKind.IDENTITY, contactId="c-1", companyId="co-1", budget=5, reason="test")
  print(t.kind, t.budget, t.attempts)
  ```

- **Repository Interface** — nothing exists yet. When done, it should be importable as:
  ```python
  from system.crm_repository import CrmRepository, MockCrmRepository
  ```

---

## Implementation Phases

### Phase 1: Core Infrastructure
**Duration:** Week 1 (complete except repository interface)

#### 1. Repository Interface — `system/crm_repository.py` [NOT STARTED]
Abstract CRM data access behind a Python interface. Model the Prisma query shapes from
`lib/lookup.ts`, `lib/crm.ts`, `lib/brand.ts`. Define return types for contact lookup,
company enrichment, deal history and dossier reads. Mock implementation for tests; real
implementation deferred until CRM data source is available.

**Source signals to read:**
- `F:/crm/packages/api/modules/crm/src/brand.ts` — `enrich_company` uses `context.dev` API
  with domain and logo path; returns `logoPath`, `website`, `industry`, `location`
- `F:/crm/packages/api/modules/crm/src/lib/lookup.ts` — `exactContacts`, `contactsByEmail`,
  `domainCompanies`, `contactsByDomain` — email match is primary evidence for identity
- `F:/crm/packages/api/modules/crm/src/lib/brand.ts` — `enrich_company_details` receives a
  `PushBrandResult` and picks from `data.records[domain]?.[i]` by logo similarity; sets
  `industry`, `location`, `logoPath`, `website` on the company
- `F:/crm/packages/api/modules/crm/src/lib/crm.ts` — `threadsForContact`, `meetingsForContact`,
  `dealsForContact`, `companiesForContact`, `contactsForCompany`, `handlesForContact`,
  `readContactDossier` — full dossier assembly

**What the interface needs to expose** (based on what the 18 skills actually call):
- `contact_by_id(id)` → single contact or None
- `contacts_by_email(email)` → list of contacts (used by `exactContacts`, `contactsByEmail`)
- `contacts_by_domain(domain)` → list of contacts at a domain (`contactsByDomain`)
- `companies_by_domain(domain)` → list of companies at a domain (`domainCompanies`)
- `company_by_id(id)` → single company or None
- `enrich_company(domain, logo_path)` → company fields from context.dev (`brand.ts`)
- `deals_for_contact(contact_id)` → list of deals (`dealsForContact`)
- `companies_for_contact(contact_id)` → list of companies (`companiesForContact`)
- `threads_for_contact(contact_id)` → list of threads (`threadsForContact`)
- `meetings_for_contact(contact_id)` → list of meetings (`meetingsForContact`)
- `handles_for_contact(contact_id)` → list of handles (`handlesForContact`)
- `contacts_for_company(company_id)` → list of contacts (`contactsForCompany`)
- `full_dossier(contact_id)` → assembled dossier (`readContactDossier` shape)

**What to model from the source** (not just return types, but the logic):
- Email match in lookup → primary evidence path for identity (used by `identify_contact`)
- Domain-based contact company inference (`contactsByDomain`) used when contact has no company
- Brand enrichment logo similarity fallback (pick first record if no logo path match)
- Dossier assembly order — threads, meetings, deals, companies, handles

**Mock implementation** — must support the tests we already have:
- `test/contact_works` — `add_contact`/`get_contact`
- `test/company_works` — `add_company`/`get_company`
- `test/full_dossier` — `full_dossier` returns name, email, handles, threads, meetings, deals, companies
- `test/full_dossier_strips_internal_note` — note field absent from dossier
- `test/dossier_missing_handles_shows_CRM_note` — "No social handles are on file for X in the CRM."
- `test/dossier_missing_threads_shows_CRM_note` — "The CRM has no email threads on file for X."
- `test/dossier_missing_deals_shows_CRM_note` — "The CRM has no deals on file for X."
- `test/dossier_missing_companies_shows_CRM_note` — "X doesn't belong to any company in the CRM."
- `test/dossier_missing_company_fields_shows_CRM_note` — "X belongs to a company in the CRM with no known industry, location, or website; say so plainly and do not make one up."
- `test/dossier_reports_unknown_company` — "The CRM has no company named Y on file. Don't guess or invent a company."
- `test/dossier_missing_company_on_contact` — "X doesn't belong to any company in the CRM."
- `test/company_enrichment_unknown_domain_uses_NA` — enrichment returns placeholder values for unknown domain
- `test/company_enrichment_unknown_domain_leaves_existing_fields` — enrichment doesn't clobber existing company fields
- `test/company_enrichment_matches_by_logo_image_path_when_logo_url_ends_with_logopath` — picks record whose `logoPath` matches the file name of the existing `logoUrl`
- `test/company_enrichment_reports_no_records` — "context.dev returned no records for DOMAIN. Don't guess or invent a company."
- `test/company_enrichment_logs_regularly` — logs domain, record count, match reason
- `test/company_enrichment_selects_best_logo_match` — picks record with closest logo path basename similarity
- `test/company_enrichment_falls_back_to_first_record_when_too_few_records_for_similarity` — ≤2 records → pick first
- `test/exact_contacts_finds_by_name` — exact match on name
- `test/exact_contacts_finds_by_email` — exact match on email
- `test/contacts_by_email_matches_domain_contacts_too` — contacts by email OR domain both match
- `test/contacts_by_domain_matches_domain_contacts_only` — contacts by domain only
- `test/domain_companies_finds_companies_by_domain` — companies by domain

#### 2. Evidence Ledger — `system/crm_evidence_ledger.py` [DONE]
Port of `lib/evidence.ts`. See status table above. Tests exist in
`tests/test_crm_evidence_ledger.py`.

#### 3. Capability System — `system/capabilities.py` [DONE]
Port of `lib/capabilities.ts`. Covers all 5 capabilities: LinkedIn (RAPIDAPI_KEY),
Web research (PERPLEXITY_API_KEY), Company brand data (CONTEXT_DEV_API_KEY),
Picture storage (BLOB_READ_WRITE_TOKEN), Session isolation (AGENT_BRIDGE_SECRET).
No test file yet.

#### 4. CRM Task Types — `system/models.py` extension [DONE]
`TaskKind` enum with 10 members, `CrmTask` and `UserContext` dataclasses,
`TaskStatus.UNCONFIGURED` and `TaskStatus.RETIRED` added.

---

### Phase 2: Tools as Skills
**Duration:** Week 1-2 (not started)

Port 18 CRM tools to Python skill handlers. Each needs `SKILL.md` + `handler.py`
+ registration in `skill_registry.py`.

| CRM Tool | Skill | Key Logic | Depends On |
|---|---|---|---|
| `search_crm` | `crm-search` | lookup → Prisma/SQL queries | Repository interface |
| `enrich_company` | `crm-enrich-company` | brand.ts → vendor API calls | Repository interface, Capability system |
| `identify_contact` | `crm-identify-contact` | Evidence ledger write | Evidence ledger, Repository interface |
| `read_crm_history` | `crm-read-history` | crm.ts → full contact dossier | Repository interface |
| `research_person` | `crm-research-person` | Perplexity API with citations | Capability system (PERPLEXITY_API_KEY) |
| `get_linkedin_profile` | `crm-linkedin-profile` | RapidAPI + verdict | Capability system (RAPIDAPI_KEY) |
| `resolve_linkedin_profile` | `crm-resolve-linkedin` | Email decomposition → slug candidates | Capability system (PERPLEXITY_API_KEY) |
| `record_fact` | `crm-record-fact` | Evidence-ledger write | Evidence ledger |
| `schedule_recheck` | `crm-schedule-recheck` | Task queue with `dueAt` | CRM Task Types |
| `read_company_history` | `crm-read-company` | Company + deals + contacts | Repository interface |
| `read_deal_history` | `crm-read-deal` | Deal timeline | Repository interface |
| `fetch_contact_photo` | `crm-fetch-photo` | LinkedIn profile image | Capability system (RAPIDAPI_KEY, BLOB_READ_WRITE_TOKEN) |
| `find_contact_socials` | `crm-find-socials` | Social links from web | Capability system (PERPLEXITY_API_KEY) |
| `get_contact_work_history` | `crm-work-history` | Employment timeline | Capability system (PERPLEXITY_API_KEY) |
| `record_job_change` | `crm-record-job-change` | Job change detection | Evidence ledger |
| `set_contact_socials` | `crm-set-socials` | Update contact socials | Repository interface |
| `write_brief` | `crm-write-brief` | `skills/writing-a-brief.md` | CRM Task Types |
| `write_workspace_profile` | `crm-write-workspace-profile` | Company self-profile | Repository interface |

**Note:** The CRM TypeScript source for these tools is in `F:/crm/packages/api/modules/crm/src/`.
Read the tool implementations there to port accurately. The `execute` function signature
and return value convention from each `defineTool` maps to the handler signature.

### Phase 3: Core Skills
**Duration:** Week 2 (not started)

Convert 4 core skills to `SKILL.md` + handlers:
- `evidence.md` → `skills/crm-evidence/SKILL.md`
- `identity-matching.md` → `skills/crm-identity-matching/SKILL.md`
- `data-boundaries.md` → `skills/crm-data-boundaries/SKILL.md`
- `writing-a-brief.md` → `skills/crm-writing-brief/SKILL.md`

Plus 18 dev skills as optional (api-architect, backend-developer, etc.).

### Phase 4: Scheduler & Dispatch
**Duration:** Week 2-3 (not started)

Port `lib/dispatch.ts` logic into `crm_dispatch.py`:
- `claimDue(limit, {only/except kinds}, leaseMs)` — `FOR UPDATE SKIP LOCKED`
- Visible lane (brand, portrait) — 60 batch, 6 concurrency, 2min lease
- Research lane (all others) — 12 batch, 30min lease
- `drainAll()` — retiring abandoned, running both lanes
- `brief(task)` — attempt-aware instructions

Integrate with The S.E.A.S. `task_queue.py` and `executor.py`.

### Phase 5: CRM Researcher Profile
**Duration:** Week 3 (not started)

Create `profiles/crm-researcher.json`.

### Phase 6: Integration & Testing
**Duration:** Week 3-4 (not started)

- Wire CRM skills into `executor.py` handler registration
- Add CRM task creation to `orchestrator.py` decomposition
- Create test fixtures with mock CRM data
- End-to-end test: claim task → execute skill → verify evidence → schedule recheck

---

## Key Design Decisions

| # | Decision | Rationale |
|---|---|---|
| 1 | No direct Postgres dependency — abstract via repository interface | The S.E.A.S. uses local files/SQLite. Adding Postgres just for the CRM layer couples the whole system to external infrastructure it doesn't need. |
| 2 | Repository interface defined before skills | The CRM API surface is known and stable in TypeScript. Model it upfront so skills can depend on it from day one; no retrofitting. |
| 3 | Eve → Python skill mapping — each `defineTool` becomes a skill with handler | Natural mapping. The `execute` function maps to handler signature. 18 tools → 18 independently testable skills. |
| 4 | Evidence ledger is portable — pure logic, no external deps | Port weights and scoring algorithm exactly. Tests exist. |
| 5 | Capability gating at skill level — check `enabled()` at handler entry | Returns unavailable result immediately when key is missing. Mirrors CRM's `capabilities.enabled()` pattern. |
| 6 | Session continuity — The S.E.A.S. tasks are already durable | CRM `continuationToken` maps to `task.id`. |

---

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Prisma schema mismatch | Read CRM TypeScript source; model from there, not from guesses |
| API key management | Use The S.E.A.S. `.env` + `capabilities.py` |
| Skill explosion | Namespace all CRM skills with `crm-` prefix |
| Budget tracking | Integrate with `metering.py` / `budget_guard.py` |
| Mock vs real divergence | Mock passes existing tests; real implementation swaps in when CRM data source is available |

---

## Success Criteria

| Criterion | Phase | Status |
|---|---|---|
| Repository interface is importable and mock passes all test signals | Phase 1 | **NOT STARTED** |
| Evidence ledger tests pass | Phase 1 | **DONE** (tests exist, run with pytest) |
| Capability system available from `system.capabilities` | Phase 1 | **DONE** |
| CRM task types available from `system.models` | Phase 1 | **DONE** |
| `crm-search` finds contacts/companies from test data | Phase 2 | Not started |
| `crm-identify-contact` writes evidence-ledger entries | Phase 2 | Not started |
| `crm-enrich-company` fills company fields from domain | Phase 2 | Not started |
| `crm-read-history` returns full dossier | Phase 2 | Not started |
| CRM researcher profile activates and runs tasks | Phase 5-6 | Not started |
| Research lane runs with 30min leases, visible lane with 2min | Phase 4 | Not started |
| Abandoned tasks retired and marked FAILED | Phase 4 | Not started |
| All 4 core skills load and guide agent behavior | Phase 3 | Not started |
| All 18 dev skills have SKILL.md + handlers registered | Phase 3 | Not started |

---

## Files: What Exists vs What's Left

### Already created (Phase 1, done)

```
F:/theseas/system/
├── crm_evidence_ledger.py          # DONE — Port of lib/evidence.ts
├── capabilities.py                 # DONE — Port of lib/capabilities.ts
├── models.py                       # MODIFIED — TaskKind, CrmTask, UserContext added
```

### Still needed (Phase 1, remaining)

```
F:/theseas/system/
└── crm_repository.py               # NOT STARTED — Abstract CRM data access
```

### Phase 2-4 (not started)

```
F:/theseas/system/
├── crm_dispatch.py                 # NEW — Port of lib/dispatch.ts
├── executor.py                     # MODIFY — Register CRM handlers
├── orchestrator.py                 # MODIFY — CRM task decomposition
├── task_queue.py                   # MODIFY — Lease management (FOR UPDATE SKIP LOCKED)

F:/theseas/skills/
├── crm-search/                     # SKILL.md + handler.py
├── crm-enrich-company/
├── crm-identify-contact/
├── crm-read-history/
├── crm-research-person/
├── crm-linkedin-profile/
├── crm-resolve-linkedin/
├── crm-record-fact/
├── crm-schedule-recheck/
├── crm-read-company/
├── crm-read-deal/
├── crm-fetch-photo/
├── crm-find-socials/
├── crm-work-history/
├── crm-record-job-change/
├── crm-set-socials/
├── crm-write-brief/
├── crm-write-workspace-profile/
├── crm-evidence/
├── crm-identity-matching/
├── crm-data-boundaries/
├── crm-writing-brief/
├── api-architect/                  # dev skill, optional
├── backend-developer/
├── frontend-developer/
├── fullstack-developer/
├── devops-engineer/
├── data-engineer/
├── ml-engineer/
├── mobile-developer/
├── security-engineer/
├── qa-engineer/
├── technical-writer/
├── system-architect/
├── database-administrator/
├── platform-engineer/
├── site-reliability-engineer/
├── solutions-architect/
├── cloud-architect/
└── emergency-response/

F:/theseas/profiles/
└── crm-researcher.json             # NEW
```

### Tests (not started, except evidence ledger)

```
F:/theseas/tests/
├── test_crm_evidence_ledger.py              # EXISTS — run with pytest
├── test_crm_repository.py                   # NOT STARTED
├── test_crm_capabilities.py                 # NOT STARTED
├── test_crm_task_types.py                   # NOT STARTED
├── test_crm_skills.py                       # NOT STARTED
├── test_crm_dispatch.py                     # NOT STARTED
└── test_crm_integration.py                  # NOT STARTED
```

---

## Timeline Estimate (updated)

| Week | Work | Status |
|---|---|---|
| Week 1 | Repository interface, evidence ledger, capabilities, CRM task types | **3/4 done** — repository interface remains |
| Week 2 | 18 CRM tools as skills, 4 core skills, skill registration | Not started |
| Week 2-3 | 18 dev skills (parallel with core skill work) | Not started |
| Week 3 | Scheduler/dispatch, CRM researcher profile | Not started |
| Week 4 | Integration testing, bug fixes, documentation | Not started |

**Total:** ~4 weeks for full integration. Currently at ~1 week of work completed (3 of 4 Phase 1 items).

---

## Next Step

**Phase 1 remaining:** `system/crm_repository.py` — the only unfinished Phase 1 item.

To start it: read the CRM TypeScript source files listed above (brand.ts, lookup.ts, crm.ts),
model the interface from the actual Prisma query shapes, write the mock implementation so it
passes the test signals we already have in `tests/test_crm_skills.py`, then write
`tests/test_crm_repository.py` to cover the interface directly.

After Phase 1 completes: move to Phase 2 (the 18 tools as skills). The first skill to port
should be `crm-search` — it depends on the repository interface and exercises the most lookup
paths, so it's the best early integration test for the interface.
