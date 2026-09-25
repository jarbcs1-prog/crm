# Voice Calling Integration Handoff

**Status date:** 2026-09-25  
**Status:** Integrated and statically verified; **not approved for unattended live calling** until the safety gates below are enforced. A controlled, consented smoke test remains pending.

This is the resume point for the research-first live-call work. Start here before changing voice code or skills.

## Current state

The CRM now has a product-neutral research-first procedure and a separate transport/CRM procedure:

- `apps/agent/agent/skills/voice-ai-cold-calling-research-first/SKILL.md` — model-loadable conversation procedure.
- `apps/agent/agent/skills/voice-ai-cold-calling-research-first/references/` — the three active technique references.
- `apps/agent/agent/skills/voice-calling.md` — provider, tool, and CRM mechanics.
- `apps/agent/data/pitches/research-first-cold-call-v1.json` — pinned policy pitch used by sales call tasks.
- `docs/voice-ai-cold-calling-skill/SKILL.md` — source/docs copy of the active procedure.
- `docs/voice-ai-cold-calling-skill/evals/evals.json` — no-live-call evaluation prompts.

The runtime and source `SKILL.md` copies are synchronized. The old brand-specific prompts and references under `docs/voice-ai-cold-calling-skill/` remain historical research artifacts; do not paste them into the agent or add them to the active skill.

## What is integrated

1. `apps/agent/agent/lib/dispatch.ts` makes `call` and `voice-batch` tasks load `voice-ai-cold-calling-research-first` with `load_skill`.
2. Those tasks pin `load_pitch` to `research-first-cold-call-v1` and pass verified `company_name` and `call_purpose` values.
3. `apps/agent/agent/tools/schedule_calls.ts` uses the same pinned skill/tool workflow for scheduled work.
4. `apps/agent/agent/tools/make_call.ts` returns a truthful identity and half-duplex `pitchHint` for answered Nonoh calls.
5. The procedure uses `load_pitch` for approved offer, pricing, verification, consent, and refusal wording; it does not invent claims.
6. Local calls use `speak_on_call` followed by one `listen_on_call` window. Hosted calls use provider status and never local speech tools.
7. Refusal, DNC, wrong-number, busy/deferral, AI-concern, consent, null transcript, and ambiguous STT paths are covered.

## Verification already completed

Run these before making further changes:

```powershell
bun run --filter=agent check-types
bun test apps/agent/test/voice-skill.spec.ts apps/agent/test/dialer.spec.ts apps/agent/test/lanes.integration.spec.ts apps/agent/test/tasks.integration.spec.ts
```

Latest result: **53 passed, 0 failed, 170 assertions**.

The targeted Biome check for the new skill, pitch, test, and eval files exits successfully. `git diff --check` has only existing line-ending warnings.

The documentation check completed after the handoff and cross-link edits:

```powershell
bash -lc "bash <(tr -d '\r' < /mnt/f/.agents/skills/docs-check/scripts/check-docs.sh)"
```

It reported repository-wide review suggestions because the worktree already contains many unrelated changes and generated Eve snapshots; no voice documentation gap was found in the synchronized handoff, `docs/agent.md`, `docs/VOIP_SETUP.md`, or the skill README.

## Known limitations and blockers

### No live call has been made

The tests are static/tool-contract/integration tests. They do not prove a real SIP answer, TTS playback, STT response, provider webhook, or end-call confirmation. A controlled smoke test is still required.

### Build is not clean

`bun run --filter=agent build` exits `0` through the repository wrapper, but the wrapper logs an `EBADDEVENGINES` error because the script invokes npm while the repository requires Bun `1.4.2`, then skips the known Eve markdown-bundling failure. Do not report a clean Eve build until it is run with the required Bun toolchain and the underlying failure is resolved.

### `load_pitch.ts` formatting

`bunx biome check apps/agent/agent/tools/load_pitch.ts` reports the existing CRLF/mixed-line-ending formatting problem. Do not broadly reformat that user-dirty file without an explicit formatting task; the logic change is covered by the passing tests.

## Safety review — not approved for unattended calls

A read-only safety review found that the current skill is safer than the original, but several guarantees still live only in prompts or model-controlled tool inputs. Treat the system as **not approved for unattended live calling** until the following are addressed and covered by fake-provider/consented Eve evaluations:

1. **DNC and scheduling suppression:** make contact/phone suppression durable and enforce it across `make_call`, `schedule_calls`, alternate phone paths, and follow-up creation. Do not conflate `not_viable` with `DO_NOT_CALL`.
2. **Pitch and policy binding:** separate active, test, and quarantined pitches; bind the approved pitch to the server-side call/policy record; do not accept arbitrary model-supplied assistants or untrusted refusal/consent data.
3. **Consent and terminal state:** derive document consent from an earlier explicit affirmative, persist refusal/clarification/terminal state, resolve branch precedence deterministically, and bound spoken turns.
4. **Provider and outcome evidence:** make hangup confirmation failure-safe, keep queued/failed calls from becoming completed outcomes, require observed evidence, and make outcome writes idempotent.
5. **Identity and scheduling controls:** constrain phone overrides, apply OSINT checks to the actual dialed number, add quiet-hours/frequency/active-call suppression, and validate transfer destinations.
6. **Content quarantine:** exclude historical or unsafe pitch/RAG material such as `apps/agent/data/objection-handlers.json` from active selection and automated evals until reviewed.

Do not treat the current passing tests as proof of these guarantees; they are structural and tool-contract tests. Make the fixes in the tools/persistence layer, then run the documented smoke test only with explicit consent and a test contact.

## Exact next session resume point

1. Read `AGENTS.md`, this file, `docs/agent.md`, `docs/VOIP_SETUP.md`, and the installed Eve skills/tools guides.
2. Run `git status --short` and preserve all unrelated dirty work. Do not reset, checkout, delete, or commit unrelated files.
3. Run the typecheck and targeted test commands above.
4. Before any live call, address the safety gates in the section above or obtain an explicit, documented decision to accept each remaining risk. Do not run unattended calls while the status above says they are unapproved.
5. Configure a consented test contact and a valid E.164 test number. Ensure the selected provider and required speech capabilities are available.
6. Run one controlled **Nonoh local** call and verify this exact sequence:

   ```text
   make_call → answered: true / IN_PROGRESS
   speak_on_call → one short identity/purpose turn
   listen_on_call → transcript and pitch guidance
   optional speak/listen turn
   end_call → confirmed termination
   record_call_outcome → observed outcome
   ```

7. Test one refusal and one DNC response. Confirm the pitch refusal branch is passed to `listen_on_call`, the call is ended, `DO_NOT_CALL` is recorded, and no callback is scheduled.
8. Test a null or clearly ambiguous transcript. Confirm the agent asks for repetition and does not infer a medical, legal, financial, or consent fact.
9. Test hosted providers separately. Confirm `make_call` returns queued/provider state and that the agent does not call local `speak_on_call` or `listen_on_call`.
10. Only after the smoke test, investigate the clean Bun/Eve build and the `load_pitch.ts` line-ending warning.

## Do not regress these decisions

- Keep the split between `voice-ai-cold-calling-research-first` and `voice-calling`.
- Keep the research-first skill product-neutral.
- Keep `load_pitch` and workspace data as the source of approved offer and policy wording.
- Do not restore the old embedded `LEGAL_APPROACH_SCRIPT` to call dispatch.
- Do not add another skill, task kind, scheduler, or API route for this work.
- Do not edit generated `.eve/agent-summary.json`; rebuild/reload the Eve agent and verify `/eve/v1/info` instead.
- Do not make a live provider call without an explicit consented test setup.

## Related documentation

- [`VOIP_SETUP.md`](./VOIP_SETUP.md) — provider configuration and call behavior.
- [`agent.md`](./agent.md) — Eve agent architecture and voice section.
- [`voice-ai-cold-calling-skill/README.md`](./voice-ai-cold-calling-skill/README.md) — skill package and evaluation index.
- [`api.md`](./api.md) — API boundary and logging rules.
- [`environment.md`](./environment.md) — root environment and optional capability rules.
