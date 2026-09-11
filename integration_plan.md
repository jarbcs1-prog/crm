# CRM Agent Integration Plan

## Overview
Embed the CRM agent's capabilities (18 tools, 4 core skills, 18 dev skills, evidence-ledger, capability gating, scheduler, sandbox) into The S.E.A.S. Python orchestration system.

## Architecture Mapping

| CRM (Eve/TypeScript) | The S.E.A.S. (Python) |
|---------------------|----------------------|
| `defineTool` → 18 tools | Skill handlers in `skill_registry.py` |
| `skills/*.md` (22 skills) | `SKILL.md` format in `skills/` dirs |
| `lib/capabilities.ts` | Capability gating in `executor.py` / `profiles.py` |
| `lib/tasks.ts` (dispatch) | `task_queue.py` + new CRM task kinds |
| `lib/evidence.ts` (ledger) | New `evidence_ledger.py` module |
| `lib/dispatch.ts` (lanes) | New `crm_dispatch.py` for research/visible lanes |
| `sandbox/` (deny-all egress) | `sandbox/` module with workspace, grep/glob/bash |
| `agent.ts` (session) | `executor.py` run loop + profile activation |

## Implementation Phases

### Phase 1: Core Infrastructure (Week 1)
1. **Evidence Ledger** (`system/evidence_ledger.py`)
   - Port `WEIGHTS`, `EvidenceKind`, `recordFact` logic
   - Primary: `profile.email-match`, `linkedin.employer-and-name`, `crm.thread-reply`, `crm.signature-block`, `github.account-identity`, `crm.meeting-attendance`
   - Supporting: `web.cited-claim`, `search.cites-profile`, `handle.name-form`, `employer-only`
   - Contradiction handling

2. **Capability System** (`system/capabilities.py`)
   - Mirror `lib/capabilities.ts`: check env vars, print startup status
   - PERPLEXITY_API_KEY, RAPIDAPI_KEY, CONTEXT_DEV_API_KEY, AGENT_BRIDGE_SECRET
   - `enabled(key)`, `unavailable(key)`, `spend(budget)` integration

3. **CRM Task Types** (`system/models.py` extension)
   - Add `TaskKind` enum: IDENTITY, PROFILE, RECHECK, MEETING_PREP, COMPANY_PROFILE, WORKSPACE_PROFILE, BRAND, PORTRAIT
   - Task attributes: `contactId`, `companyId`, `budget`, `reason`, `attempts`

### Phase 2: Tools as Skills (Week 1-2)
Port 18 CRM tools to Python skill handlers:

| CRM Tool | The S.E.A.S. Skill | Key Logic |
|----------|-------------------|-----------|
| `search_crm` | `crm-search` | `lib/lookup.ts` → Prisma/SQL queries |
| `enrich_company` | `crm-enrich-company` | `lib/brand.ts` → vendor API calls |
| `identify_contact` | `crm-identify-contact` | Evidence ledger write |
| `read_crm_history` | `crm-read-history` | `lib/crm.ts` → full contact dossier |
| `research_person` | `crm-research-person` | Perplexity API with citations |
| `get_linkedin_profile` | `crm-linkedin-profile` | RapidAPI + verdict |
| `resolve_linkedin_profile` | `crm-resolve-linkedin` | Email decomposition → slug candidates |
| `record_fact` | `crm-record-fact` | Evidence-ledger write |
| `schedule_recheck` | `crm-schedule-recheck` | Task queue with `dueAt` |
| `read_company_history` | `crm-read-company` | Company + deals + contacts |
| `read_deal_history` | `crm-read-deal` | Deal timeline |
| `fetch_contact_photo` | `crm-fetch-photo` | LinkedIn profile image |
| `find_contact_socials` | `crm-find-socials` | Social links from web |
| `get_contact_work_history` | `crm-work-history` | Employment timeline |
| `record_job_change` | `crm-record-job-change` | Job change detection |
| `set_contact_socials` | `crm-set-socials` | Update contact socials |
| `write_brief` | `crm-write-brief` | `skills/writing-a-brief.md` |
| `write_workspace_profile` | `crm-write-workspace-profile` | Company self-profile |

Each skill needs:
- `SKILL.md` with frontmatter (name, description, triggers, tags, risk_level)
- Handler function in `skills/<name>/handler.py`
- Registration in `skill_registry.py`

### Phase 3: Core Skills (Week 2)
Convert 4 core skills to `SKILL.md` + handlers:
- `evidence.md` → `skills/crm-evidence/SKILL.md`
- `identity-matching.md` → `skills/crm-identity-matching/SKILL.md`
- `data-boundaries.md` → `skills/crm-data-boundaries/SKILL.md`
- `writing-a-brief.md` → `skills/crm-writing-brief/SKILL.md`

Plus 18 dev skills (api-architect, backend-developer, etc.) as optional.

### Phase 4: Scheduler & Dispatch (Week 2-3)
Port `lib/dispatch.ts` logic:
- `crm_dispatch.py` with:
  - `claimDue(limit, {only/except kinds}, leaseMs)` — `FOR UPDATE SKIP LOCKED`
  - Visible lane (brand, portrait) — 60 batch, 6 concurrency, 2min lease
  - Research lane (all others) — 12 batch, 30min lease
  - `drainAll()` — retiring abandoned, running both lanes
  - `brief(task)` — attempt-aware instructions

Integrate with The S.E.A.S. `task_queue.py` and `executor.py`.

### Phase 5: Sandbox (Week 3)
Create `system/sandbox/`:
- `workspace/` — persistent dossier directory
- `bash`, `grep`, `glob` tools
- Deny-all egress (no network from sandbox)
- `web_fetch`/`web_search` run in executor, not sandbox
- Session isolation via signed tokens (like CRM `AGENT_BRIDGE_SECRET`)

### Phase 6: CRM Researcher Profile (Week 3)
Create `profiles/crm-researcher.json`:
```json
{
  "name": "crm-researcher",
  "purpose": "Autonomous CRM contact/company enrichment using evidence-ledger methodology",
  "skill_tags": ["crm-search", "crm-enrich-company", "crm-identify-contact", "crm-read-history", "crm-research-person", "crm-linkedin-profile", "crm-resolve-linkedin", "crm-record-fact", "crm-schedule-recheck", "crm-evidence", "crm-identity-matching", "crm-data-boundaries", "crm-writing-brief"],
  "model_preference": "strong",
  "context_level": "full",
  "capabilities": ["crm-evidence-ledger", "crm-identity-verification", "crm-web-research", "crm-linkedin-enrichment", "crm-brand-enrichment", "crm-scheduling"],
  "risk_tolerance": "low",
  "max_concurrent_tasks": 6,
  "config": {"budget_per_task": 10, "visible_concurrency": 6, "research_lease_minutes": 30}
}
```

### Phase 7: Integration & Testing (Week 3-4)
- Wire CRM skills into `executor.py` handler registration
- Add CRM task creation to `orchestrator.py` decomposition
- Create test fixtures with mock CRM data
- End-to-end test: claim task → execute skill → verify evidence → schedule recheck

## Key Design Decisions

1. **No direct Postgres dependency** — CRM tools use Prisma; The S.E.A.S. uses local files/SQLite. Abstract via repository interface.

2. **Eve → Python skill mapping** — Each `defineTool` becomes a skill with handler. The `execute` function maps to handler signature.

3. **Evidence ledger is portable** — Pure logic, no external deps. Port weights and scoring algorithm exactly.

4. **Capability gating at skill level** — Check `capabilities.enabled()` at handler entry, return unavailable result.

5. **Sandbox as separate process** — Use `subprocess` with restricted env or `microsandbox` Python bindings.

6. **Session continuity** — The S.E.A.S. tasks are already durable. CRM `continuationToken` maps to `task.id`.

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Prisma schema mismatch | Define repository interface; mock in tests |
| API key management | Use The S.E.A.S. `.env` + `capabilities.py` |
| Sandbox security | Deny-all egress, no DB_URL, separate process |
| Skill explosion | Namespace all CRM skills with `crm-` prefix |
| Budget tracking | Integrate with `metering.py` / `budget_guard.py` |

## Success Criteria

- [ ] CRM researcher profile activates and runs tasks
- [ ] `crm-search` finds contacts/companies from test data
- [ ] `crm-identify-contact` writes evidence-ledger entries
- [ ] `crm-enrich-company` fills company fields from domain
- [ ] `crm-read-history` returns full dossier (threads, meetings, deals)
- [ ] Research lane runs with 30min leases, visible lane with 2min
- [ ] Abandoned tasks retired and marked FAILED
- [ ] Sandbox executes `grep`/`bash` on workspace dossiers
- [ ] All 4 core skills load and guide agent behavior

## Files to Create/Modify

```
system/
├── evidence_ledger.py          # NEW - Port of lib/evidence.ts
├── capabilities.py             # NEW - Port of lib/capabilities.ts
├── crm_dispatch.py             # NEW - Port of lib/dispatch.ts
├── crm_repository.py           # NEW - Abstract CRM data access
├── sandbox/
│   ├── __init__.py
│   ├── workspace.py            # Dossier management
│   ├── tools.py                # bash, grep, glob
│   └── runner.py               # Subprocess with deny-all egress
├── models.py                   # MODIFY - Add CRM task kinds
├── executor.py                 # MODIFY - Register CRM handlers
├── orchestrator.py             # MODIFY - CRM task decomposition
├── task_queue.py               # MODIFY - Lease management (FOR UPDATE SKIP LOCKED)

skills/
├── crm-search/
│   ├── SKILL.md
│   └── handler.py
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
└── crm-writing-brief/

profiles/
└── crm-researcher.json         # NEW

tests/
├── test_crm_evidence_ledger.py
├── test_crm_skills.py
├── test_crm_dispatch.py
└── test_crm_integration.py
```

## Timeline Estimate

- **Week 1**: Evidence ledger, capabilities, CRM task types, repository interface
- **Week 2**: 18 tools as skills, 4 core skills, skill registration
- **Week 3**: Scheduler/dispatch, sandbox, CRM researcher profile
- **Week 4**: Integration testing, bug fixes, documentation

Total: ~4 weeks for full integration.