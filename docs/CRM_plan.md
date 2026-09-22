1. Commercial Discovery Agent — highest priority

Mission: Find out whether the proposed customer actually has the problem and will pay to solve it.

Have this agent focus on:

identifying DACH RevOps / CRM owners;
identifying companies that recently migrated CRM systems;
researching the contact-data-cleaning/migration pain;
building a prospect list;
preparing interview targets;
creating the five-interview research package;
recording evidence rather than generating assumptions;
maintaining an assumption → evidence → confidence → decision ledger.

The assessment's first experiment is five Mom-Test-style interviews, with no product pitching.

Agent output

Have it produce something like:

commercial/
  assumptions.md
  beachhead.md
  icp.md
  interview-script.md
  prospects.csv
  interview-notes/
  evidence-ledger.md
  experiment-status.md

Most importantly:

Don't let this agent decide that DACH is correct.

Its job is to test the DACH hypothesis.

2. Verification Product Agent — the only engineering work that matters immediately

This becomes your small engineering strike team.

Tell it:

Finish only the minimum end-to-end workflow necessary to take a real WAMP/HubSpot export and produce a verified-contact result.

The assessment identifies the current missing pieces as:

set_verification_status
set_contact_methods
streaming import
verification badge/UI
human-review queue

I'd explicitly tell this agent:

DO
Import
  ↓
Normalize
  ↓
Create/contact-match
  ↓
Research
  ↓
Evidence ledger
  ↓
VERIFIED / PROBABLE / POSSIBLE / NEEDS_HUMAN
  ↓
Human review
  ↓
Export
DO NOT
build another CRM module;
redesign the dashboard;
build voice;
expand OSINT;
build elaborate autonomous loops;
add arbitrary integrations;
polish animations;
invent new AI features.

The purpose is to make the commercial experiment executable, not to reach “v1.”

3. Agent Research / Competitive Intelligence

This agent should answer one narrow question:

What are people already paying for to solve this problem and where does our evidence-ledger approach differ?

The assessment names:

Clay
Apollo
Cognism
Lusha
Dropcontact
Hunter
Attio
Folk
HubSpot
Salesforce
Pipedrive

as relevant alternatives.

But I wouldn't have your agent produce a giant competitor report.

Have it create a commercial battlecard containing:

Competitor
Customer
Problem solved
Pricing model
Verification claims
Enrichment sources
CRM write-back
DACH coverage
Privacy/self-hosting
What they don't appear to solve
Evidence for each claim

The important question isn't:

“Can we beat Clay?”

It's:

“Is there a specific job these products don't solve adequately that our evidence ledger can solve?”

4. Concierge Operations Agent

This one is particularly important.

The assessment recommends three real concierge migrations.

I'd actually have an agent build the machinery for this.

Its job:

Input
Customer CSV / HubSpot export / WAMP dump
Process
Import
→ deduplicate
→ identify contacts
→ research
→ gather evidence
→ verify
→ flag NEEDS_HUMAN
→ calculate cost
→ produce report
→ export results
Output
customer/
  original-data/
  normalized-data/
  verified-data/
  evidence/
  needs-human/
  final-export/
  verification-report.md
  cost-report.md

And measure everything.

Especially:

contacts processed;
contacts verified;
contacts requiring human review;
vendor/API calls;
LLM consumption;
search consumption;
time per contact;
cost per contact;
percentage of contacts with usable evidence;
percentage that remain uncertain.

That gives you the beginnings of the actual unit economics.

5. Commercial Metrics / Decision Agent

This is the one I would add specifically because of the way you tend to run your projects.

Give this agent responsibility for preventing the other agents from disappearing down engineering rabbit holes.

Its job is to maintain a simple:

Commercial Control Board

Something like:

┌────────────────────────────────────────────┐
│ CRM COMMERCIAL VALIDATION                  │
├────────────────────────────────────────────┤
│ ICP hypothesis                             │
│ DACH RevOps / CRM owners                   │
│                                            │
│ Interviews                                 │
│ 0 / 5                                      │
│                                            │
│ Concierge customers                        │
│ 0 / 3                                      │
│                                            │
│ Paid conversions                           │
│ 0                                          │
│                                            │
│ Revenue                                    │
│ €0                                         │
│                                            │
│ Cost / verified contact                    │
│ UNKNOWN                                    │
│                                            │
│ Gross margin                               │
│ UNKNOWN                                    │
│                                            │
│ Landing-page experiment                    │
│ NOT STARTED                                │
│                                            │
│ Decision                                   │
│ UNVALIDATED                                │
└────────────────────────────────────────────┘

Every agent should be able to see this.

I would also change your agent governance

This is probably more important than adding agents.

For the next two weeks, establish a rule:

No engineering task is valid unless it enables a commercial experiment, improves the concierge workflow or removes a demonstrated blocker to delivering verified contacts.

The assessment itself recommends essentially this: no PR should be merged unless it is connected to a falsifiable assumption and experiment.

I'd make that an actual repository rule.

For example:

Every PR must declare:

ASSUMPTION:
What are we trying to learn?

EXPERIMENT:
What real-world test does this enable?

EVIDENCE:
What result will increase/decrease confidence?

DECISION:
What will we do depending on the result?

That should dramatically reduce “interesting engineering” from consuming the project.

What I would NOT have your agents do right now

I'd explicitly put these into a parked backlog:

🛑 Voice

Park it.

The assessment considers voice complex, regulated, insufficiently validated and a separate category.

🛑 Big OSINT expansion

Park it.

Keep the infrastructure that's already useful for verification, but don't turn OSINT into another product.

🛑 CRM feature expansion

Park:

pipelines;
sophisticated deal management;
fancy dashboards;
workflow builders;
elaborate reporting;
generic sales automation.
🛑 Branding/design

Not yet.

The assessment specifically places brandkit, copy polishing, animation and similar work after demand validation.

🛑 SEO

Not yet.

The assessment considers outbound + partners the initial distribution hypothesis and SEO a later scaling mechanism.

The agent structure I'd use

I'd therefore temporarily organize the swarm like this:

                    ┌─────────────────────┐
                    │ COMMERCIAL CONTROL  │
                    │      AGENT          │
                    └──────────┬──────────┘
                               │
          ┌────────────────────┼────────────────────┐
          │                    │                    │
          ▼                    ▼                    ▼
 ┌────────────────┐   ┌─────────────────┐   ┌────────────────┐
 │ CUSTOMER       │   │ COMPETITIVE     │   │ CONCIERGE     │
 │ DISCOVERY      │   │ INTELLIGENCE    │   │ OPERATIONS    │
 └────────────────┘   └─────────────────┘   └───────┬────────┘
                                                      │
                                                      ▼
                                            ┌─────────────────┐
                                            │ VERIFICATION    │
                                            │ ENGINEERING     │
                                            └─────────────────┘
                                                      │
                                                      ▼
                                            ┌─────────────────┐
                                            │ EVIDENCE        │
                                            │ LEDGER          │
                                            └─────────────────┘

The evidence ledger remains the center of gravity.

That's the part I would protect most carefully.

And I would give your agents a hard 14-day objective

Not:

“Make the CRM commercially viable.”

That's too vague.

Give them this:

Within 14 days, determine whether someone will pay for verified CRM contact data and produce enough working software to deliver that outcome to three real prospects.

Success means you have:

5 interviews

3 real datasets

3 verification runs

real COGS

at least some payment/commitment evidence

a decision to persist, pivot or park.

Those are essentially the milestones the assessment recommends.

One important modification I'd make to the assessment

I would not immediately commit the whole project to “DACH RevOps” as fact.

Treat it as:

Hypothesis H1: DACH RevOps/CRM owners undergoing migration have sufficiently painful contact-data problems to pay for evidence-backed verification.

Then let the agents attack H1.

That's more consistent with the report's own warning that the beachhead, willingness to pay and even the proposition itself are currently unsupported assumptions.

If H1 survives, great—you have direction.

If it doesn't, you haven't spent three months building a DACH-specific CRM around an assumption.

If this were my agent brief

I would make the very next task to your orchestration agent:

Reconfigure the F:\crm agent swarm around commercial validation rather than feature development. Read the Commercial Viability assessment as the governing strategic document. Establish the five workstreams: Commercial Discovery, Verification Engineering, Competitive Intelligence, Concierge Operations and Commercial Control. Freeze voice, broad OSINT, CRM feature expansion, branding, animation and SEO unless a validated experiment explicitly unfreezes them. Create an assumption/evidence/experiment ledger. Identify the minimum engineering slice required for a real WAMP/HubSpot verification concierge run. Do not assume the proposed DACH RevOps beachhead is validated; treat it as a falsifiable hypothesis. Every PR must identify the assumption it tests, the experiment it enables and the evidence required for completion. The 14-day objective is to obtain real market evidence sufficient to decide persist, pivot or park.

That is the direction I'd shift the agents right now.

And importantly, this doesn't mean stopping development of F:\crm. It means changing development from “build the product” to “build only what lets us test and deliver the product's potentially valuable outcome.”