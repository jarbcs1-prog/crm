# Voice AI Cold Calling Skill

This directory contains the source and evaluation material for the CRM's research-first live-call procedure.

The runtime copy that Eve loads is:

`apps/agent/agent/skills/voice-ai-cold-calling-research-first/`

The runtime skill is intentionally product-neutral. It does not define a company, price, service, market statistic, or closing script. Research-first sales tasks pin `research-first-cold-call-v1`; approved offer, identity, and policy wording comes from that pitch plus verified workspace values returned by `load_pitch`. Provider state and consent are enforced by the typed voice tools. The system is not approved for unattended live calling until the safety gates in the handoff are enforced.

## Active procedure

- `SKILL.md` — the model-loadable procedure for live sales qualification
- `references/research-survey.md` — permission-first discovery and qualification
- `references/customer-journey-mirror.md` — optional post-demo reflective conversation
- `references/live-call-quality.md` — listening, escalation, consent, and close rules
- `evals/evals.json` — lightweight evaluation prompts and expectations

## Runtime use

Call tasks in `apps/agent/agent/lib/dispatch.ts` explicitly ask the agent to load `voice-ai-cold-calling-research-first` and pin `load_pitch` to `research-first-cold-call-v1` before dialing. The transport and CRM procedure remains in `apps/agent/agent/skills/voice-calling.md`.

The current implementation status and exact new-session resume procedure live in [`docs/voice-ai-cold-calling-handoff.md`](../voice-ai-cold-calling-handoff.md).

Do not paste the old brand-specific prompts into the agent. The historical files that remain in `references/` are research artifacts, not active runtime instructions; the active skill points only to the three cleaned references above.
