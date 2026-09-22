# Commercial Viability — What Would Have to Change?

**Project:** `F:\crm` — agentic-first CRM (durable research agent is the product; database is where it writes)  
**Date:** 2026-09-16  
**Author:** Deep-dive assessment across skill libraries + codebase  
**Scope:** Product, positioning, audience, business model, execution, strategy — optimized for evidence of willingness to pay, not intellectual interest  
**Revision:** 1.1 — incorporates steering review 2026-09-16 (beachhead as hypothesis H1, zero-budget outbound, pricing-unit discovery, four-gate kill logic, evidence hierarchy, frozen/allowed list).  
**Highest-level rule for all agents:** *Agents are not allowed to prove that the current product is a good idea. They are responsible for trying to disprove the business hypothesis as cheaply and quickly as possible.*

> TL;DR: The strongest asset is not the CRM. It is the **evidence-ledger agent** (weighted scoring, deny-all sandbox, durable leased tasks, no-guess discipline). The CRM itself is undifferentiated and currently un-sellable to a generic “sales team”. The fastest path to revenue is to **stop selling a CRM and start selling a narrow, researched-contact-as-a-service** to a single beachhead where bad contact data already costs money — but the beachhead itself is a hypothesis to attack, not a decision to defend.

---

## Method and evidence base

**Codebase read:** `README.md`, `AGENTS.md`, `docs/{agent,api,design,environment}.md`, `docs/plan/{contact-intelligence-agent,gmail-calendar-plan,people-enrichment-agent}.md`, `docs/crm-plan.md`, `packages/db/prisma/schema.prisma` (33 models, 21 migrations), `apps/agent` (30 tools, 20 skills, 1 schedule), `apps/api` (12 routers, 52 procedures), `apps/app` (Next.js 16 + nuqs), `reports/PROJECT-ASSESSMENT-2026-09-13.md`.

**Skill library census (deep dive):**

| Location | Count | Notes |
|---|---|---|
| `C:\Users\PC Principal\.agents\skills` | 198 dirs | Vendor/engineered skills, heavy on infra, voice, cloud, LLM |
| `C:\Users\PC Principal\.config\opencode\skills` | 119 dirs | Loop-engineering + pm-skills mirror + design/animation |
| `F:\.agents\skills` | ~420 dirs | Superset: firecrawl/* (24), research/search (10), market-research, tavily/exa/brave, data/analytics, autonomous loops |
| `F:\new_skills` | 16 dirs | `loop-engineering-1.6.0`, `agent-governance-toolkit`, `recon-skills`, `memory-engineering`, etc. |
| `F:\pm-skills-2.1.0` | 71 skills across 8 packs | `pm-product-discovery` (12), `pm-product-strategy` (12), `pm-market-research` (6), `pm-go-to-market` (5), `pm-marketing-growth` (5), `pm-data-analytics` (3), `pm-execution` (13), `pm-ai-shipping` (2), `pm-toolkit` (4) |

Inventory method: `Get-ChildItem -Directory` on each root, cross-checked against `pm-skills-2.1.0` recursive listing and `F:\.agents\skills` filter for `search|research|tavily|firecrawl|exa`.

---

## The 50 best-fit skills for this project, ranked for commercial viability

Ranking logic follows the brief: **Think → Validate → Design → Build → Launch → Measure → Iterate** and within that: **Experiment design is the bridge** — every strategic claim must be reduced to the cheapest test that moves confidence in willingness to pay. Strategy skills before copywriting. Evidence before vibes.

### Tier 0 — The 12 fundamentals (do these first or nothing else matters)

| Rank | Skill | Source path | Category | Why essential |
|---|---|---|---|---|
| 1 | `identify-assumptions-existing` | `F:\pm-skills-2.1.0\pm-product-discovery\skills\identify-assumptions-existing` | Strategic / Critical thinking | Maps Value/Usability/Viability/Feasibility assumptions for an *existing* product. Use to deconstruct “agentic-first CRM” into falsifiable claims. |
| 2 | `identify-assumptions-new` | `F:\pm-skills-2.1.0\pm-product-discovery\skills\identify-assumptions-new` | Critical thinking | 8-risk-category scan if you pitch this as a new venture to an investor. |
| 3 | `prioritize-assumptions` | `F:\pm-skills-2.1.0\pm-product-discovery\skills\prioritize-assumptions` | Decision analysis | Impact × Risk matrix. Produces the ordered list of what to test. |
| 4 | `brainstorm-experiments-existing` | `F:\pm-skills-2.1.0\pm-product-discovery\skills\brainstorm-experiments-existing` | Experiment design | Prototypes, A/B tests, spikes — cheapect validation for an existing product without building. |
| 5 | `brainstorm-experiments-new` | `F:\pm-skills-2.1.0\pm-product-discovery\skills\brainstorm-experiments-new` | Experiment design | XYZ hypotheses + pretotypes (landing page, explainer video, pre-orders) for new-market entry. |
| 6 | `interview-script` | `F:\pm-skills-2.1.0\pm-product-discovery\skills\interview-script` | Customer discovery | JTBD-guided, Mom-Test-compliant script. Stops you pitching during discovery. |
| 7 | `summarize-interview` | `F:\pm-skills-2.1.0\pm-product-discovery\skills\summarize-interview` | Research synthesis | Structured synthesis (JTBD, pains, satisfaction) from raw transcripts. |
| 8 | `opportunity-solution-tree` | `F:\pm-skills-2.1.0\pm-product-discovery\skills\opportunity-solution-tree` | Product discovery | Torres OST: outcome → opportunities → solutions → experiments. Prevents feature-factory. |
| 9 | `value-proposition` | `F:\pm-skills-2.1.0\pm-product-strategy\skills\value-proposition` | Product strategy | 6-part JTBD template (Who/Why/What before/How/What after/Alternatives). Core of positioning. |
| 10 | `business-model` | `F:\pm-skills-2.1.0\pm-product-strategy\skills\business-model` | Business-model design | 9-block Business Model Canvas. Forces explicit channel, cost, revenue. |
| 11 | `monetization-strategy` | `F:\pm-skills-2.1.0\pm-product-strategy\skills\monetization-strategy` | Business-model design | 3–5 monetization options with audience fit, risk and validation experiments. |
| 12 | `pricing-strategy` | `F:\pm-skills-2.1.0\pm-product-strategy\skills\pricing-strategy` | Pricing & unit economics | Model comparison, willingness-to-pay estimation, elasticity. Single biggest leverage after ICP. |

### Tier 1 — Market and customer evidence (validate before you build)

| 13 | `competitor-analysis` | `F:\pm-skills-2.1.0\pm-market-research\skills\competitor-analysis` + `F:\.agents\skills\competitor-analysis` | Deep research | Direct-competitor mapping, strengths/weaknesses, differentiation gaps. |
| 14 | `market-sizing` | `F:\pm-skills-2.1.0\pm-market-research\skills\market-sizing` | Quantitative | TAM/SAM/SOM top-down + bottom-up. Kills “every sales team” fantasy. |
| 15 | `market-segments` | `F:\pm-skills-2.1.0\pm-market-research\skills\market-segments` | Market research | 3–5 segments with JTBD + fit analysis. Input to beachhead choice. |
| 16 | `beachhead-segment` | `F:\pm-skills-2.1.0\pm-go-to-market\skills\beachhead-segment` + `C:\Users\PC Principal\.config\opencode\skills\beachhead-segment` | GTM | Scoring burning pain × willingness to pay × winnable share × referral potential. |
| 17 | `ideal-customer-profile` | `F:\pm-skills-2.1.0\pm-go-to-market\skills\ideal-customer-profile` | Customer discovery | ICP from survey/data: demographics, behaviour, JTBD. |
| 18 | `user-personas` | `F:\pm-skills-2.1.0\pm-market-research\skills\user-personas` | Customer research | 3 refined personas with JTBD, pains, gains, unexpected insights. |
| 19 | `user-segmentation` | `F:\pm-skills-2.1.0\pm-market-research\skills\user-segmentation` | Customer research | At-least-3 distinct segments from feedback data. |
| 20 | `customer-journey-map` | `F:\pm-skills-2.1.0\pm-market-research\skills\customer-journey-map` | Customer discovery | Stages, touchpoints, emotions, pain points, opportunities. |
| 21 | `sentiment-analysis` | `F:\pm-skills-2.1.0\pm-market-research\skills\sentiment-analysis` | Research synthesis | Scaled feedback → segments with sentiment + satisfaction. |
| 22 | `product-strategy` | `F:\pm-skills-2.1.0\pm-product-strategy\skills\product-strategy` | Strategic reasoning | 9-section canvas (vision, segments, costs, value, trade-offs, metrics, growth, capabilities, defensibility). |

### Tier 2 — Strategic stress-testing and positioning

| 23 | `strategy-red-team` | `F:\pm-skills-2.1.0\pm-execution\skills\strategy-red-team` | Critical thinking | Attacks load-bearing assumptions, ranks failure modes by impact×likelihood×cheapness-to-test. |
| 24 | `swot-analysis` | `F:\pm-skills-2.1.0\pm-product-strategy\skills\swot-analysis` | Strategic reasoning | Strengths/Weaknesses/Opportunities/Threats with recommendations. |
| 25 | `porters-five-forces` | `F:\pm-skills-2.1.0\pm-product-strategy\skills\porters-five-forces` | Competitive analysis | Industry attractiveness (rivalry, supplier/buyer power, substitutes, entrants). |
| 26 | `pestle-analysis` | `F:\pm-skills-2.1.0\pm-product-strategy\skills\pestle-analysis` | Strategic reasoning | Macro environment (Political/Economic/Social/Tech/Legal/Environmental). |
| 27 | `ansoff-matrix` | `F:\pm-skills-2.1.0\pm-product-strategy\skills\ansoff-matrix` | Strategic reasoning | Growth paths: penetration/development/diversification. |
| 28 | `startup-canvas` / `lean-canvas` | `F:\pm-skills-2.1.0\pm-product-strategy\skills\startup-canvas` + `lean-canvas` | Product strategy | Combines strategy + business model + problem/solution/metrics. |
| 29 | `gtm-strategy` | `F:\pm-skills-2.1.0\pm-go-to-market\skills\gtm-strategy` | GTM | Channels, messaging, success metrics, launch timeline. |
| 30 | `gtm-motions` | `F:\pm-skills-2.1.0\pm-go-to-market\skills\gtm-motions` | GTM | 7 motions (Inbound/Outbound/Paid/Community/Partners/ABM/PLG) + tooling. |
| 31 | `positioning-ideas` | `F:\pm-skills-2.1.0\pm-marketing-growth\skills\positioning-ideas` | Positioning | Differentiated positioning vs named competitors with rationale. |
| 32 | `competitive-battlecard` | `F:\pm-skills-2.1.0\pm-go-to-market\skills\competitive-battlecard` | Competitive / Sales | Head-to-head vs HubSpot/Attio/Clay with win/loss patterns, objection handling. |

### Tier 3 — Deep research, SEO and demand intelligence (replace opinions with queries)

| 33 | `tavily-search` | `F:\.agents\skills\tavily-search` + `F:\crm\.agents\skills` (mirrored) | Deep research / Web intel | Citation-backed web research; finds LinkedIn slugs, recent news before a call. |
| 34 | `exa-search` | `F:\.agents\skills\exa-search` | Deep research | Semantic search, research with citations. |
| 35 | `brave-web-search` | `F:\.agents\skills\brave-web-search` | Deep research | Privacy-focused search with snippets; cheap triangulation. |
| 36 | `firecrawl-deep-research` | `F:\.agents\skills\firecrawl-deep-research` | Autonomous execution | Multi-step agentic research that produces deliverables. |
| 37 | `firecrawl-competitive-intel` | `F:\.agents\skills\firecrawl-competitive-intel` | Competitive intel | Scaled competitor scraping + change monitoring. |
| 38 | `firecrawl-market-research` | `F:\.agents\skills\firecrawl-market-research` | Market research | Pricing, gaps, trends across domains. |
| 39 | `firecrawl-seo-audit` | `F:\.agents\skills\firecrawl-seo-audit` | SEO & demand intelligence | Technical SEO + keyword gap vs competitors. **Answers: are people searching for this problem?** |
| 40 | `deep-research` | `F:\.agents\skills\deep-research` | Autonomous research | General harness for multi-source synthesis. |

### Tier 4 — Quantitative, experimentation and measurement

| 41 | `ab-test-analysis` | `F:\pm-skills-2.1.0\pm-data-analytics\skills\ab-test-analysis` + `C:\Users\PC Principal\.config\opencode\skills\ab-test-analysis` | Quantitative | Significance, sample size, confidence, ship/extend/stop decision. |
| 42 | `cohort-analysis` | `F:\pm-skills-2.1.0\pm-data-analytics\skills\cohort-analysis` | Quantitative | Retention curves, feature adoption by cohort. |
| 43 | `sql-queries` | `F:\pm-skills-2.1.0\pm-data-analytics\skills\sql-queries` | Quantitative | NL → SQL (Postgres/BigQuery), schema-aware. |
| 44 | `metrics-dashboard` | `F:\pm-skills-2.1.0\pm-product-discovery\skills\metrics-dashboard` | Analytics & instrumentation | KPI selection, sources, visualisation, alert thresholds. |
| 45 | `north-star-metric` | `F:\pm-skills-2.1.0\pm-marketing-growth\skills\north-star-metric` | Metrics | North Star + 3–5 input metrics, game classification (Attention/Transaction/Productivity). |

### Tier 5 — Execution, growth and shipping (build only after evidence)

| 46 | `growth-loops` | `F:\pm-skills-2.1.0\pm-go-to-market\skills\growth-loops` | Growth experimentation | 5 loop types (Viral/Usage/Collaboration/UGC/Referral) — sustainable traction vs paid acquisition. |
| 47 | `create-prd` | `F:\pm-skills-2.1.0\pm-execution\skills\create-prd` | Product management | 8-section PRD (problem, objectives, segments, value props, solution, release plan). |
| 48 | `sprint-plan` | `F:\pm-skills-2.1.0\pm-execution\skills\sprint-plan` | Agile / Project planning | Capacity estimation, story selection, dependency mapping, risk ID. |
| 49 | `shipping-artifacts` | `F:\pm-skills-2.1.0\pm-ai-shipping\skills\shipping-artifacts` + `C:\Users\PC Principal\.config\opencode\skills\shipping-artifacts` | Deployment / Shipping | Durable docs: architecture, permission flows, vars/secrets, test-coverage map for audit/handoff. |
| 50 | `verification-planning` | `C:\Users\PC Principal\.config\opencode\skills\verification-planning` + `intended-vs-implemented` + `verification-before-completion` | QA / Systems thinking | Evidence path for every behaviour change; finds gap between intended and implemented. |

**Honourable mentions not in top 50 but high-fit depending on pivot:**
`value-prop-statements` (copy), `marketing-ideas`, `product-name`, `prioritize-features`, `prioritization-frameworks`, `pre-mortem`, `stakeholder-map`, `user-stories`/`wwas`/`job-stories`, `test-scenarios`, `dummy-dataset`, `lead-research-assistant` (`F:\.agents\skills\lead-research-assistant`), `firecrawl-lead-gen`/`firecrawl-lead-research`, `autonomous-loops`/`continuous-agent-loop`, `agent-teams-simplify-and-harden`, `incremental-implementation`.

**Deliberately de-prioritised (beneficial but not essential now):**
Animation/design (`animate`, `apple-design`, `emil-design-eng`), heavycode scaffolding (`architecture-patterns`, `hybrid-cloud-networking`), voice cloning, replica image pipelines — they optimise a product before demand is proven.

---

## Highest-leverage changes — Essential vs Beneficial

### Essential (do or remain unsellable)

**E1. Attack H1 — do not defend it. The beachhead is a hypothesis to falsify.**  
**H1:** *DACH RevOps/CRM owners at 20–200-person B2B companies undergoing CRM migration have sufficiently painful contact-data problems to pay for evidence-backed verification.*  
“Any sales team” is not a market, but “DACH RevOps, 20–200 B2B, migration” is not a decision — it is the leading candidate to test. WAMP + `LegacyImportMapping` + `viability.ts` make it the best prior, not a commitment. Run `beachhead-segment` + `ideal-customer-profile` + `market-segments` to *score* H1, then attack it: if interviews reveal the real buyer is a HubSpot agency rather than the end company, change the ICP immediately. Everything — pricing, messaging, channels — follows the *validated* beachhead, not the initial guess.

**E2. Stop selling a CRM. Sell the verification outcome.** The CRM market is 1,000+ players and HubSpot owns “lightweight CRM”. The only defensible wedge here is the **evidence-ledger + verification** (“we will tell you, with provenance, which contacts are still correct and fix what we can prove”). Repo already has `ContactFact` bands, `ContactMethod`, `verificationStatus`, `AgentTask kind=verify`. Finish WS5–WS8 (the two missing tools, import CLI, UI badges) and reposition: “Verified contact database in 48 hours. CRM included if you want it.” This is `value-proposition` + `positioning-ideas` work. It collapses a 12-month CRM bake-off into a 2-week outcome.

**E3. Prove willingness to pay before writing more product — with zero-budget outbound, not paid ads.** Three cheapest experiments (see Q11) must run *before* Phase 5/7 agent fantasies, voice calling or OSINT. No more code until 5 discovery interviews + 20 targeted outbound prospects → landing-page/audit offer → 3 concierge imports have produced scored evidence on four gates (Problem / Solution / Payment / Channel, see Q12). Paid LinkedIn ads are removed — zero budget — so the outbound itself tests the distribution mechanism. Use `brainstorm-experiments-existing`/`new` + `interview-script` + `prioritize-assumptions`.

**E4. Price discovery, not a price — explicitly label €0.40/contact an assumption and test the pricing unit.** Current `.env.example` has no pricing. Without unit economics you cannot model CAC, gross margin or capacity. Run `pricing-strategy` + `monetization-strategy` + `market-sizing`, but treat every number as falsifiable. €0.40/verified contact is a *test price*, not a requirement. Agents must calculate `Revenue/contact − search cost − enrichment cost − LLM cost − infra − human-review cost` per dataset and discover whether buyers think in per-contact, per-1,000, audit (€750), cleanup (€1,500), monitoring (€500/mo) or agency-wholesale terms. The experiment must return the pricing *unit* the buyer prefers, not just a number. Scan competitors (Clay, Apollo, Cognism, Lusha, folk/Attio: €0.10–€1.50/enriched contact or €50–€200/seat/mo) as anchors, not targets.

**E5. Commit to a distribution motion that matches the *validated* beachhead and test it as part of the experiment.** Tool-agnostic GTM (`gtm-strategy` + `gtm-motions` + `growth-loops`): the prior for DACH mid-market migrations is **Outbound + Partners (RevOps agencies/HubSpot consultants) + Referral**, not PLG or paid search. One partner who migrates 10 customers is worth 1,000 SEO clicks. Validate this with the 20-prospect outbound sequence — open/reply → audit → data-send rate is the channel evidence. SEO and content are beneficial later.

### Beneficial (do after essentials are proven)

**B1. Finish the WAMP verification UI and batch import polish** (`create-prd` + `sprint-plan`) — only beneficial if E2/E3 validate demand; otherwise it is a beautiful internal tool nobody paid for.

**B2. Layer SEO & demand intelligence** (`firecrawl-seo-audit` + `tavily-search` + `exa-search`) — validate whether “contact verification”, “CRM migration DACH”, “verify HubSpot contacts” have search volume and whether you can rank. Essential later for inbound, not now for outbound beachhead.

**B3. Shipping hardening** (`shipping-artifacts`, `intended-vs-implemented`, `verification-planning`, `sprint-plan` execution) — production deployment (Vercel projects, pooled DB, Blob, CRON) plus hygiene (docs drift, `dbping.tmp.ts`, execution_plan artifacts). Needed for *delivery* but not for *demand proof*.

**B4. Voice calling + OSINT** — impressive, but scope creep until the core wedge pays. Park them as “labs” and gate on revenue.

**B5. Copywriting, brandkit, animation, content strategy** (`value-prop-statements`, `marketing-ideas`, `product-name`, `brandkit`) — last, not first. Positioning before copywriting.

---

## Assumptions treated as fixed that should be reconsidered

| “Fixed” constraint | Reconsidered view | Challenge skill |
|---|---|---|
| **Single-tenant, no organizations** | The original “no orgs” rule is already violated (`Organization`, `WorkspaceProfile`, `SsoProvider` exist). Either commit to true multi-tenant (and price per workspace) or embrace *managed single-tenant* — host one DB per customer, but run it as a service. **Caution:** do not auto-market “dedicated instance per customer” as a privacy differentiator. Reframe as: *Investigate whether managed single-tenant deployment is commercially valuable to the target ICP* — validate with interviews before claiming it. The latter keeps deny-all sandbox simplicity *if* validated. | `business-model` + `swot-analysis` + `interview-script` |
| **Google-only auth, allow-list is the whole auth model** | Works for internal dog-food, kills enterprise deals (Azure AD, SAML, SCIM). You already built SSO rows (`ssoProvider`, issuer discovery). Decide: keep Google-only for self-hosted, offer SSO as a paid tier. | `pestle-analysis` (compliance) |
| **“Intelligence never lives in the API”** | Correct as an invariant — keep it. Reconsider only the interpretation: it was meant to stop enrichment drift, not to forbid *proprietary model distillation*. A verified-contact export that writes back to HubSpot/Salesforce *is* allowed. | `intended-vs-implemented` |
| **Vercel + Postgres + Prisma + Better Auth** | Fine for now, but “any Postgres” already in `README` is a commercial signal — self-hostable is a differentiator vs Clay/Apollo. Keep it, but do not add Vercel-only primitives (Blob) without a self-host fallback (S3-compatible). | `business-model` (cost structure) |
| **Agent must be eve, model is `zai/glm-5.2-fast` default** | The skill is the *evidence model*, not the framework. If a beachhead needs lower latency/cost, a smaller model with the same tool ledger is valid. The `lib/capabilities.ts` + `defineDynamic` model switch already supports it. | `strategy-red-team` |
| **No confidence scores, no image search by name** | Keep. This is the moat. Document it as the moat (competitors hallucinate titles). | `competitive-battlecard` |
| **The sandbox has no network and no `DATABASE_URL`** | Keep. Reconsider only for OSINT: if you sell OSINT, the sandbox *must* stay isolated but will need allow-listed vendor egress via the app runtime (current `web_fetch`/`web_search` pattern). | `shipping-artifacts` |
| **Voice calling is the wedge** | It is not. Voice infra (`VOIPSTUDIO_*`, Kokoro, Whisper) is the most complex subsystem, least proven and most regulated. Reframe as Phase 2 after verification wedge pays. | `prioritize-features` + `prioritization-frameworks` |
| **“We sell to sales teams”** | Reconsider to **sell to RevOps / data owners**, not reps. Reps are users; RevOps has the budget and feels the pain of dirty data at reporting time. | `ideal-customer-profile` + `user-personas` |
| **Every outside source is optional** | True technically, commercially false. A install with zero keys is a contact list with no logos and no verification — demo-ware, not a product. Name the *minimum viable keyset* (e.g. `CONTEXT_DEV_API_KEY` + one search key) and price it in. | `monetization-strategy` |

---

## 12 Questions

### 1. What is the project's strongest commercial asset?

The **durable research agent with an evidence ledger, not the CRM.** Specifically:

- **Evidence, not confidence** (`lib/evidence.ts` + `lib/facts.ts`): tools report observations (`crm.signature-block`, `github.account-identity`), ledger prices them into `VERIFIED`/`PROBABLE`/`POSSIBLE`. No prompt-estimated scores. Human overwrites are never overwritten, dismissals never re-offered.
- **Deny-all sandbox + `web_fetch`/`web_search` at model provider**: customer email bodies never leave via shell; sandbox has no `DATABASE_URL`. Auditable, GDPR-friendly for DACH.
- **Leased work queue** (`AgentTask` + `FOR UPDATE SKIP LOCKED` + collapsing drain + poke): survives redeploys, disjoint across dispatchers, visible vs research lanes (portraits/brands do not queue behind research). Competitors run request-response; this runs unattended with a budget.
- **Workspace profile** (who *we* are, 320-char narrative, in every preamble): briefs are fit/competitor/partner *for this company*, not generic dossiers.

Everything else (companies/contacts/deals/timeline) is commodity CRM. The ledger + lane discipline is not.

### 2. What is currently its biggest commercial weakness?

**No customer, no demand evidence, no positioning, no price — and a product that tries to be a general CRM in the most crowded market on earth.**

Concretely:

- `docs/crm-plan.md` vs `docs/plan/crm-plan.md` disagree; voice/OSINT/workspace have no plan docs; `README` tool counts are stale. A buyer cannot understand what this *is*.
- `ALLOWED_SIGN_IN` + single-tenant + Google-centric auth positions it as an internal tool, not a sellable SaaS.
- Nothing is deployed (`reports/PROJECT-ASSESSMENT-2026-09-13.md` D1–D3). There is no trial, no checkout, no demo data story beyond `db:seed`.
- Zero SEO footprint, zero content, zero partner channel, zero outbound motion designed.
- The active WAMP verification workstream is the *closest* thing to a wedge and is uncommitted and broken (two tools missing, import CLI absent, UI absent).

This is classic **product before distribution**. Fix distribution before product.

### 3. Which assumptions are unsupported?

Ranked by Impact × Risk (`prioritize-assumptions`):

| Assumption | Status | How to falsify |
|---|---|---|
| Sales teams want *another* CRM (even an agentic one) | **Unsupported** — no interviews, no landing-page CTR, no waitlist | 5 Mom-Test interviews on “how did you last migrate/clean contacts?”; measure unprompted pain frequency |
| “Agentic-first” is a buying criterion (vs outcome: verified contacts) | **Unsupported** — category invention without demand | A/B landing page: A = “Agentic-first CRM”, B = “Verified contacts in 48h — CRM included”. CTR + price-anchor survey |
| People will pay for verification / enrichment per contact | **Unsupported** — no willingness-to-pay study, no per-contact pricing | Van Westendorp or 5 price-point interviews + concierge offer at €0.40/contact |
| Single-tenant self-hosted is acceptable to buyers | **Unsupported** — DACH mid-market partly yes (privacy), enterprise no (SCIM, audit log, RBAC). Need segmentation | 5 RevOps interviews + SSO requirement check |
| Google mail/calendar sync is sufficient as data source | **Unsupported** — SSO users have no Gmail; success depends on `RAPIDAPI_KEY`/`TAVILY` etc. budget left unpriced | Test with zero-key install; measure coverage before vs after keys |
| Voice calling will differentiate and pay | **Unsupported** — most complex, regulated, un-validated; competes with Aircall/JustCall | Park; validate only after core wedge |
| OSINT on contacts has demand beyond pilot DACH | **Unsupported** — `OsintTarget`/`viability.ts` scoped to Germany/Switzerland pilot with no buyer named | Define OSINT buyer (compliance? sales intel?) and test 1 pilot offer |
| “Built the other way round” (agent writes, humans review `PROBABLE`) is usable | **Partially supported** — `ContactFact` + `AgentEvent` UX exists, but no usability test on “Needs human” queue throughput | Usability task: can a rep clear 20 `NEEDS_HUMAN` in <15 min? |

### 4. What am I treating as fixed that doesn't actually need to be fixed?

See table above — the highest-leverage “unfixes”:

1. **Single-tenant** — can become managed-single-tenant-per-customer as a hosted service and still be priced per seat/workspace. Privacy *is* the pitch in DACH.
2. **“We are a CRM”** — can become “we are a verification/migration service that ships a CRM if you want one.” Preserves vision (durable intelligence writes facts) while changing the SKU.
3. **Google-only** — can keep Google for self-host, add SSO as paid tier (already 80% built).
4. **“All vendor keys optional”** — can become “two keys required for verified outcome, priced into COGS” (Context.dev + one search provider). Optional is a dev story, not a commercial one.
5. **Voice as wedge** — can become voice as *retention* after verification lands.

### 5. What could be changed without destroying the core vision?

Core vision to protect: *durable agent owns intelligence, evidence ledger, no guesses, database is where it writes, optional capabilities, deny-all sandbox.*

Safe to change (no vision damage):

- **Targeting**: narrow to RevOps/DACH migration beachhead; keep agent identical.
- **Packaging**: per-verified-contact + per-seat hybrid pricing; keep ledger.
- **Distribution**: outbound + agency partners vs PLG; keep product.
- **UI surface**: verification queue, badges, “needs human” filter; keep data model.
- **Auth**: add SAML/OIDC as tier; keep allow-list semantics.
- **Deployment**: document self-host fallback for Blob, keep Vercel as default.
- **Messaging**: “agentic CRM” → “verified-contact CRM”; keep agent.

These are `positioning-ideas` + `gtm-strategy` + `pricing-strategy` moves — they change how you sell it, not what it is.

### 6. What could be radically changed if maximizing revenue were the priority?

If revenue > purity:

- **Become Clay for DACH mid-market.** Drop the ambition to replace HubSpot; become the *enrichment + verification layer* that writes back to the CRM they already have (HubSpot/Salesforce/Pipedrive). `ContactFact` + `AgentTask` become an API. CRM UI becomes optional. This turns a 12-month rip-and-replace sale into a 1-week “keep your CRM, fix your data” sale and opens usage-based pricing at scale.
- **White-label the agent to agencies.** RevOps consultancies already sell migrations; give them a multi-workspace hosted agent they resell per customer. `Organization`/`SsoProvider`/`WorkspaceProfile` are already there. Charge agencies per workspace + per verified contact, they mark up.
- **Kill voice/OSINT from v1, reinvest into 2-way HubSpot/Salesforce sync + dedupe.** Higher willingness to pay than calls; voice is a separate category with separate buyer.
- **Add multi-tenant + RBAC + audit log and sell to 50–500-person companies** where RevOps controls tooling. Single-tenant dog-food was correct for incubation, wrong for revenue scale.
- **Introduce a “concierge migration” SKU at €3k–€8k**: white-glove WAMP/H HubSpot import + dedupe + verification + report. Human-in-the-loop first, then automate what repeats. This is `monetization-strategy`’s “service → product” ladder and funds the build.

All three preserve the ledger; they change the business model from “sell seats for a CRM” to “sell verified outcomes/API/wholesale”.

### 7. Who is the most likely paying customer?

**Primary beachhead (highest evidence in repo):**

**RevOps lead / CRM owner at a 20–200-person B2B company in DACH, migrating or post-migrating HubSpot/Salesforce, sitting on 5k–50k contacts with 30–60% stale, with a real WAMP/legacy MySQL dump or HubSpot export.**

Why them:

- They already pay for a CRM, so budget exists and switching cost is already incurred (migration = moment of maximum pain).
- Dirty data is visibly costing them (bounce rates, failed outreach, “the board looks wrong”).
- DACH buys privacy + on-premise narrative (single-tenant managed host is a feature).
- The repo already built for them: `LegacyImportMapping`, `ContactMethod`, `verificationStatus`, `OsintTarget`/`viability.ts` pilot, `suppressedDomain`.

**Secondary (if wedge validates):**

- RevOps agencies / HubSpot consultants who do 10–50 migrations a year — channel partner, not end customer.
- Sales-led SMEs where the owner is the RevOps (they just call themselves CEO).

**Non-customers (deprioritise):**

- Generic “any sales team” in US SMB — too competitive, no distribution advantage, pricing race to zero.
- Enterprise needing SCIM, field-level permissions, approval flows — you lack the platform depth.

Validate with `ideal-customer-profile` + `user-personas` + 5 interviews. Score with `beachhead-segment`.

### 8. What would they actually pay for?

Not a CRM seat. They pay for **certainty and time back.**

Ranked by observed alternatives and repo evidence:

1. **Verified contact list they can trust for outreach** — “which of my 12,400 contacts are still at the company, in the right role, with a working email/phone I may use and who needs a human check?” Deliverable: exportable CSV + in-CRM `VERIFIED`/`NEEDS_HUMAN` queue with provenance. Willingness-to-pay signal strongest because *dirty list = wasted SDR time + bounces*.
2. **Zero-effort company enrichment that stays correct** — logo, industry, location, socials, headcount band, fetched and mirrored (so it does not rot). You already do this via `Context.dev` + `mirror()` + `brand` lane at 60/6.
3. **Migration + dedupe without spreadsheet hell** — idempotent import that does not double-create, keeps provenance (`LegacyImportMapping`) and queues verification.
4. **Briefs before a call** (`ContactBrief` + `write_brief`) — one paragraph that says what this person means *for us* (fit/competitor/partner), not a dossier. Only after 1–3 are solid.
5. **A CRM if it comes free with 1** — they will use it if it is simpler than HubSpot and their data is already verified inside it.

They will **not** pay for: voice calling (separate budget, separate buyer, compliance headache), OSINT as a standalone or “agentic” branding.

### 9. What competing alternatives do they currently use?

| Job | Current alternatives | Your wedge vs them |
|---|---|---|
| CRM itself | HubSpot, Pipedrive, Salesforce, Attio, Folk | You win on **verified data + hosted single-tenant privacy**, not on feature matrix. Don’t compete on pipeline customization. |
| Enrichment/verification | Clay, Apollo, Cognism, Lusha, Dropcontact, Hunter, Apollo, Clearbit (legacy), BuiltWith, `context.dev` directly | You win on **provenance + “don’t guess” + in-CRM queue** (they write a score; you write VERIFIED vs needs-human). Price per-verified-contact, not per-seat. |
| Migration/dedupe | Manual CSV, HubSpot import wizard, Insycle, custom scripts, agencies | You win on **idempotent WAMP/MySQL import + agent verification + agency white-label**. |
| Pre-call research | Perplexity/ChatGPT, LinkedIn Sales Navigator, human SDR research | You win on **dossier with sources keyed to identifiers, not name search** (you already forbid image search by name). |
| Voice | Aircall, JustCall, Ringover, Voipstudio direct | You lose until wedge is proven. Avoid head-on. |

Run `competitor-analysis` + `firecrawl-competitive-intel` on Clay + Apollo + Folk + Attio + Cognism: extract pricing, enrichment sources, verification claim, HubSpot write-back, DACH coverage.

### 10. What evidence would prove that the project has real demand?

Not stars, not praise — **paid or equivalently costly commitment.** Hard evidence hierarchy (no amount of lower-level evidence substitutes for a higher level):

| Evidence level | What it tells us |
|---|---|
| Agent research / report | What *might* be true |
| Interview statement (“we have this problem”) | Problem may exist |
| Prospect agrees to send data / books audit | Problem is actionable |
| Concierge completed (verified export delivered) | Solution *can* produce the outcome |
| Prospect pays (€500 audit / cleanup / per-unit) | Willingness to pay |
| Prospect pays again / subscribes | Recurring value |
| Prospect refers another customer / agency resells | Strong product + channel evidence |

**Rule:** No number of agent-generated reports can substitute for customer evidence.

- **Weak (vanity):** landing page visits, GitHub stars, “I’d use this”, waitlist emails.
- **Medium (intent):** 30-sec explainer video completion + “book a migration audit” clicks from 20 outbound prospects; 5/10 interviewees rank dirty contacts as top-3 RevOps pain unprompted; HubSpot export actually sent.
- **Strong (proxy payment):** 5 concierge imports at €500–€1,500 each with real MySQL/H HubSpot dumps; 3 pre-orders with *discovered* pricing unit (not assumed €0.40); a RevOps agency signs LOI for 3 white-label workspaces.
- **Conclusive (payment):** 10 paying workspaces, gross margin positive per workspace after Context.dev + search + LLM + infra + human-review costs (calculate `Revenue − search − enrichment − LLM − infra − human-review` per contact), weekly active `VERIFIED` queue clearance by owner, 60%+ 30-day retention on verification rechecks.

Define four-gate criteria now (see Q12) — a failure on one gate does not falsify the others. Use `metrics-dashboard` + `north-star-metric` to instrument: North Star candidate = **verified contacts that moved to `VERIFIED` and were acted on (exported or touched in outreach) in last 30 days** — not seats, not companies.

### 11. What are the 3 cheapest experiments I could run to obtain that evidence?

**Cost is measured in days and euros, not roadmaps. Each has a falsification condition. Budget is €0 — no paid ads. Outbound itself tests the channel.**

**Experiment 1 — 5 Mom-Test interviews (3 days, €0 + time)**

- **Skill:** `interview-script` + `summarize-interview`
- **What:** Recruit 5 RevOps/CRM owners in DACH who migrated or deduped in last 12 months (LinkedIn, HubSpot agency Slack, your own WAMP contacts). 20-min script: “Walk me through the last time you had to trust your contact list. What did you do next? What did it cost?” No pitching. Attack H1 — do not defend it.
- **Signal (Gate A — Problem validation):** ≥3/5 mention unverified contacts/role drift/bounces as top-3 pain *unprompted* → continue. 0–1/5 → wrong beachhead, re-segment (do not conclude product failure).
- **Artifact:** 5 recorded transcripts + 1 synthesis doc with JTBD, pains, willingness-to-pay quotes.

**Experiment 2 — 20 targeted outbound prospects → landing page / audit offer → conversations (3–4 days, €0)**

- **Skills:** `gtm-motions` + `value-prop-statements` + `positioning-ideas`
- **What:** Highly targeted outbound to 20 prospects matching H1 (or revised ICP): personalized note + link to fake-door landing page with two value-prop variants (A: “Agentic-first CRM”, B: “Verified contacts in 48h — CRM included. Fix your HubSpot import without spreadsheets.”) + audit offer. 30-sec Loom explainer. No ads — outbound is the traffic and the distribution test.
- **Signal (Gate D — Channel validation):** reply → audit-booked → data-send funnel. Even 0/20 converting to concierge is not a product kill if interviews validated the problem or agencies show reseller intent — diagnose which gate failed.
- **Artifact:** Outbound list, open/reply rate, landing CTR by variant, price-unit preference (not just price), 5 “book audit” calls booked (which become experiment 3 leads).

**Experiment 3 — Concierge WAMP/HubSpot import for 3 design partners (5–7 days, €0 dev beyond finishing WS5–WS7 minimally)**

- **Skills:** `prioritize-assumptions` + `brainstorm-experiments-existing` + `verification-planning` + `pricing-strategy`
- **What:** Offer 3 targets from Exp. 2: “Send me your dump/export, I return a verified queue in 48h. If you use it, pay with your preferred pricing unit; if not, keep it.” Finish only `set_verification_status` + `set_contact_methods` + streaming import + verification badge — the minimal WS5–WS8 slice. Hand-queue the `verify` tasks and clear `NEEDS_HUMAN` manually to simulate the UX. Use `tavily-search`/`exa-search` + Context.dev + ledger; log cost per contact and calculate `Revenue − search − enrichment − LLM − infra − human-review` per dataset. Test pricing units: per-contact vs per-1,000 vs €750 audit vs €1,500 cleanup vs €500/mo monitoring vs agency wholesale.
- **Signal (Gate B — Solution validation + Gate C — Payment validation):** 2/3 pay and 1 refers another → wedge validated. 0/3 pay despite “it looks useful” → diagnose: pricing unit vs value prop vs buyer (see Q12 gates) — pivot packaging/buyer, not product, before parking.
- **Artifact:** 3 before/after data packs, COGS per verified contact by pricing unit, gross-margin calc, time-to-verify distribution, 3 testimonials or 3 falsification notes. Landing page/pricing test becomes supporting evidence, not the primary validator.

**Total cost:** ~10–12 days, €0 + vendor credits. **No new subsystems** until these move confidence. Landing page/pricing test supports outbound; interviews + concierge carry the weight.

### 12. Under what circumstances should I persist, pivot or abandon the project?

**Use four separate gates — acquisition failure ≠ product failure. A blunt “0/20 → park” is forbidden.**

| Gate | Question | Evidence | If it fails |
|---|---|---|---|
| **A. Problem validation** | Do prospects consistently describe the problem unprompted? | ≥3/5 interviews rank dirty contacts/role drift/bounces top-3 | Re-segment beachhead/ICP — do not conclude product failure |
| **B. Solution validation** | Will they provide data for a concierge run? | Data-send / audit-booked rate from 20 outbound | Message or buyer wrong — iterate positioning/ICP before pivoting product |
| **C. Payment validation** | Will they actually pay and how? | € paid + pricing-unit preference + gross margin `Revenue − search − enrichment − LLM − infra − human-review` >0 | Pricing unit or packaging wrong — test audit/cleanup/monitoring/wholesale before abandoning wedge |
| **D. Channel validation** | Can prospects be reached economically? | Outbound reply rate, partner LOI, CAC via 20 outbound vs landing | Channel wrong — try partners/agencies, not “CRM doesn’t work” |

**Persist (double down on current vision + distribution fix) when:**

- Gate A passes: ≥3/5 interviews name dirty contacts/role drift as top-3 pain, unprompted
- Gate B+C pass: ≥2/3 concierge imports pay (any pricing unit) and refer, gross margin positive on discovered unit (not assumed €0.40)
- Gate D passes or has a path: 20 outbound produces audit conversations, or a RevOps agency says “give me white-label for 3 clients”
- You can answer the four questions from the revised objective (see below) and name the ICP in one sentence without “any sales team”

Then: finish WS5–WS8, deploy (Track D), close 10 paid workspaces, then add HubSpot/Salesforce write-back.

**Pivot (keep the ledger, change the SKU/buyer/channel) when:**

- Gates A+B pass but C is unit-dependent → **pivot pricing unit** (e.g. buyers want €1,500 cleanup, not per-contact)
- People love the verified queue but won’t rip out HubSpot → **pivot to enrichment + verification layer that writes back**, CRM becomes optional
- DACH end-companies won’t pay but agencies will → **pivot to white-label + per-workspace wholesale** (agency is the customer)
- Single-tenant host is the deal-breaker for enterprises you’re talking to → **pivot to true multi-tenant** and price for 50–500 seats
- Voice/OSINT gets pull but verification doesn’t → treat as disconfirming, not validating — do not pivot *to* voice

Pivot trigger: Gates A+B pass, C fails on per-contact but would pass on audit/cleanup, or interviews say “if this wrote back to HubSpot we’d pay tomorrow”.

**Abandon (or park as internal tool / open-source portfolio piece) when:**

- Gate A fails even after re-segmenting 2× (0/5 rank verifiability top-5, different beachheads)
- Gates A+B+C all fail after second iteration on message and pricing unit
- COGS per verified contact ≥ any pricing unit anyone will pay after negotiation (margin permanently negative even with cheaper model/search keys and human-review optimization)
- Context.dev + search + LLM + LinkedIn vendor risk makes provenance collapse (e.g. LinkedIn shuts LinkDAPI path and no alternative at viable price)
- Gate D fails across outbound *and* partners: you cannot name a channel that reaches the buyer for <€100 CAC at any validated price

Then: archive as a reference implementation of the evidence ledger + lane discipline (it’s excellent engineering), not a company. Open-source it with the verification story as the README or keep it as the internal CRM it was designed to be.

**Review cadence:** Re-run `prioritize-assumptions` + `strategy-red-team` after each experiment batch. Do not burn more than 3 weeks without a persist/pivot decision. Diagnose which gate failed — never collapse to “CRM doesn’t work.”

---

## Essential vs beneficial — summary table

| Change | Type | Why it matters | Skill(s) to run |
|---|---|---|---|
| Attack H1 as falsifiable beachhead (DACH RevOps migration hypothesis) | **Essential** | Forces hypothesis-driven ICP; prevents locking into unvalidated segment | `beachhead-segment`, `market-segments`, `ideal-customer-profile`, `identify-assumptions-*` |
| Reposition from “CRM” to “verified contacts in 48h” | **Essential** | Collapses bake-off, creates willingness-to-pay moment | `value-proposition`, `positioning-ideas`, `competitor-analysis` |
| Run 3 cheapest experiments (interviews → 20 outbound → 3 concierge) zero-budget | **Essential** | Prevents 3 months of building for nobody; tests channel as well as product | `prioritize-assumptions`, `brainstorm-experiments-*`, `interview-script`, `gtm-motions` |
| Pricing-unit discovery + gross-margin per dataset | **Essential** | Makes unit economics falsifiable without dogma; discovers audit vs per-contact vs wholesale | `pricing-strategy`, `monetization-strategy`, `market-sizing` |
| Choose outbound + partners as motion, test via 20 prospect sequence | **Essential** | Distribution is the bottleneck; outbound itself is the experiment | `gtm-strategy`, `gtm-motions`, `growth-loops` |
| Finish WAMP verification slice (tools + import + badge) | **Essential if E validates** | Unblocks the wedge; leave voice/OSINT parked | `create-prd`, `sprint-plan`, `verification-planning` |
| SEO, content, brandkit, copy polishing | Beneficial | Scales inbound after wedge | `firecrawl-seo-audit`, `tavily-search`, `value-prop-statements`, `marketing-ideas` |
| Voice calling, OSINT scale-up | Beneficial (later) | Impressive but unfunded, regulated | `prioritize-features`, `prioritization-frameworks` |
| Production deploy + hygiene | Beneficial (after demand) | Needed to sell, not to prove demand | `shipping-artifacts`, `intended-vs-implemented` |

---

## Revised 14-day objective

**Instead of** “Determine whether someone will pay for verified CRM contact data”, **the objective is:**

> **Determine whether a specific customer segment will pay for a measurable verified-contact outcome, identify the buyer and pricing unit and demonstrate that the current evidence-ledger system can deliver that outcome profitably for three real datasets.**

This compels four separate answers — if any is missing, the CRM must not proceed into normal product development:

1. **Who hurts?** (validated ICP/beachhead, not assumed DACH)
2. **What outcome do they buy?** (“verified contacts in 48h”, not “agentic CRM”)
3. **What will they pay and how do they want to buy it?** (pricing unit discovery, not €0.40 dogma)
4. **Can we deliver it with positive unit economics?** (`Revenue − search − enrichment − LLM − infra − human-review` >0 per dataset)

---

## Architecture for the next two weeks (customer result is the end of the pipeline, not the CRM UI)

```
                    COMMERCIAL CONTROL
                           │
             ┌─────────────┼─────────────┐
             │             │             │
        CUSTOMER       COMPETITOR     OUTBOUND
        DISCOVERY      INTEL          / PARTNERS
             │             │             │
             └─────────────┼─────────────┘
                           │
                    EVIDENCE LEDGER
                           │
                  VERIFICATION PIPELINE
                           │
          ┌────────────────┼────────────────┐
          │                │                │
       IMPORT          RESEARCH         HUMAN REVIEW
          │                │                │
          └────────────────┼────────────────┘
                           │
                     VERIFIED EXPORT
                           │
                     CUSTOMER RESULT
                           │
                       PAYMENT
                           │
                       RETENTION
```

*Change from original:* customer result now terminates the engineering pipeline; CRM UI is not the finish line.

---

## Frozen vs Allowed (operationally brutal — no reinterpretation)

**Frozen until commercial validation passes Gates A–C:**

Voice · Broad OSINT · CRM feature expansion · Workflow automation · Advanced dashboards · Branding redesign · Animation · SEO · PLG · Broad integrations · Enterprise RBAC/SCIM · General-purpose agent capabilities

**Allowed:**

Import · Normalize · Deduplicate · Research · Evidence ledger · Verification state · Human review queue · Export · Cost tracking · Minimal prospect-facing UI · Anything required to run a real concierge engagement

Build only what is on the allowed list. Everything else is a distraction until three real datasets have paid.

---

## Evidence hierarchy — core agents rule

| Evidence | What it tells us |
|---|---|
| Agent research | What *might* be true |
| Interview statement | Problem may exist |
| Prospect agrees to send data | Problem is actionable |
| Concierge completed | Solution can produce outcome |
| Prospect pays | Willingness to pay |
| Prospect pays again | Recurring value |
| Prospect refers another customer | Stronger product/channel evidence |

**Crucially, no number of agent-generated reports can substitute for customer evidence.** This becomes a core agents rule alongside `docs/agent.md` and `docs/api.md`.

---

## Recommended next 14 days (do not skip order) — zero-budget revision

1. **Day 1–2:** Run `identify-assumptions-existing` + `prioritize-assumptions` workshop on H1. Write Impact×Risk board with four gates (A/B/C/D). Output: ordered assumption list + H1 explicitly marked “attack, do not defend.”
2. **Day 2–3:** Draft `interview-script` + recruit 5 DACH RevOps contacts (WAMP network + LinkedIn + 1 agency). Book them. Concurrently draft outbound sequence for 20 prospects.
3. **Day 3–6:** Conduct + `summarize-interview`. Update ICP (`ideal-customer-profile`), beachhead score (`beachhead-segment`) and value prop (`value-proposition`). Decide: persist H1 or re-segment ICP (agency vs end company).
4. **Day 6–9:** Run 20 targeted outbound → landing page (two variants) / audit offer → conversations. No ads. Measure reply → audit → data-send funnel and pricing-unit preference. `firecrawl-market-research` for keyword sanity, `tavily-search` for competitor angles only to support outbound copy.
5. **Day 9–13:** Minimal concierge slice for 3 design partners (2 missing tools `set_verification_status`/`set_contact_methods` + import + badge). Run concierge; log COGS and calculate gross margin per pricing unit. Test audit vs per-contact vs per-1,000 vs monitoring vs wholesale.
6. **Day 13–14:** Decision review with four-gate diagnosis: `strategy-red-team` + `swot-analysis` + `ab-test-analysis` on outbound + interview + concierge outcomes → persist / pivot (pricing unit / buyer / channel / layer) / park. Diagnose which gate failed.

**One non-negotiable rule:** No PR merged that isn’t tied to a falsifiable assumption and its experiment. Enforce with `verification-planning` + `intended-vs-implemented`. Agents operate under the highest-level rule: try to disprove H1 as cheaply and quickly as possible.

---

## Appendix — How this report used the skill census

- Every “essential” skill in Tier 0 maps to one falsification experiment; every “beneficial” skill in Tiers 3–5 is gated on Tier 0 evidence.
- Deep research skills (`tavily-search`, `exa-search`, `firecrawl-*`, `deep-research`) were ranked *after* strategy skills because research without a prioritized assumption list produces trivia. Use them to answer the prioritized assumptions, not to browse.
- SEO and demand-intel skills were ranked as Tier 3 (not Tier 0) because for a DACH migration beachhead, outbound + partners dominate inbound — SEO is scale, not validation.
- `shipping-artifacts` / `intended-vs-implemented` / `verification-planning` close the loop: they turn “we shipped” into auditable evidence that distribution, not just code, advanced.

---

*Full skill sources consulted: `C:\Users\PC Principal\.agents\skills` (198), `C:\Users\PC Principal\.config\opencode\skills` (119), `F:\.agents\skills` (~420), `F:\new_skills` (16), `F:\pm-skills-2.1.0` (71). The 50 above are the highest-leverage subset for “maximize commercial viability” under the Think→Validate→Design→Build→Launch→Measure→Iterate progression.*
