# Agent Prompts — triggering SIP test calls

Copy-paste prompts for driving the CRM voice agent through a test call.
They follow `apps/agent/agent/skills/voice-ai-cold-calling-research-first/SKILL.md`:
`load_pitch` first, then `make_call`, then record the outcome.
Fill in the bracketed values before sending.

Shared values for every prompt below:

- `[CONTACT]` — `John B.` or `Dan Da Man`
- `[COMPANY]` — verified company name, e.g. `J.A.R.B. Research Consultancy Services`
- `[PURPOSE]` — verified call purpose, e.g.
  `a brief introduction to how we help teams follow up faster`
- Never invent `[COMPANY]` or `[PURPOSE]`. If unverified, stop and ask.

## Prompt 1 — pre-dial safety check (no call placed)

```text
Pre-dial check for [CONTACT], no calling yet:
1. Confirm the contact has a stored phone number and that it is valid E.164.
2. Confirm the contact has an owner and a company.
3. Confirm the voice provider is nonoh and that Nonoh SIP settings are
   configured (sip server, username, password saved — status "Nonoh ready").
4. Load pitch research-first-cold-call-v1 with company_name=[COMPANY] and
   call_purpose=[PURPOSE] and report any missing variables.
Report all four results and do NOT call make_call.
```

## Prompt 2 — full research-first test call (real dial)

```text
Place a research-first test call to [CONTACT]:
1. Call load_pitch with pitchId research-first-cold-call-v1,
   company_name=[COMPANY], call_purpose=[PURPOSE].
   If company_name or call_purpose is missing, stop and ask me — do not invent them.
2. Call make_call for [CONTACT] using the stored number, passing the
   assistant object from load_pitch if the provider requires it.
3. If make_call returns refused, invalid-number, missing-number, no-provider
   or queued, follow the returned reason: report it and stop. Do not simulate
   a conversation for a call that is not live and answered.
4. Only if the call is live and answered: run the research-first discovery
   from the pitch (one question at a time, permission first), pass the
   pitch refusalBranches to every listen turn, and follow terminal guidance
   on any opt-out.
5. At the end call end_call, then record_call_outcome with the observed
   outcome and a one-paragraph evidence-based summary.
```

## Prompt 3 — Nonoh direct-dial test call

```text
Place a Nonoh test call to [CONTACT]:
1. load_pitch research-first-cold-call-v1 with company_name=[COMPANY],
   call_purpose=[PURPOSE].
2. make_call for [CONTACT] with the load_pitch assistant object. Nonoh dials
   directly — if it returns no-provider, report the missing Nonoh SIP
   settings and stop.
3. Only speak the pitch once the call is live and answered. Never claim it
   connected, was heard, or booked anything until a tool confirms it.
4. When the call ends, end_call, then record_call_outcome with what was observed.
```

## Prompt 4 — refusal / do-not-call handling check

```text
Test call to [CONTACT] for objection handling:
steps 1-2 from Prompt 2, then: if the callee declines, asks to stop calling,
or asks for a human, follow the pitch terminal guidance for that branch
(explicit_refusal / do_not_contact / not_right_person), end the call, record
DO_NOT_CALL via record_call_outcome, and confirm no follow-up was scheduled.
```

## Prompt 5 — demo queue check (demo UI/API only, no audio)

The standalone demo cannot dial. This prompt describes what the demo's
Call button does, for validating data before a real test:

```text
In the CRM demo at http://localhost:3000 with provider nonoh and Nonoh SIP
settings saved (status "Nonoh ready"), press Call on [CONTACT] and confirm
the Calls tab shows one OUTBOUND QUEUED row whose calleeNumber equals the
contact's E.164 phone with a demo-nonoh sipCallId and a via value of
username@server:port, plus a CALL activity entry on the contact. If settings
are missing, confirm Call is refused with HTTP 409 listing the missing fields.
```

## Quick reference for the agent

| Situation | Expected behavior |
|---|---|
| No pitch loaded | load_pitch first, use the approved record |
| Call queued (hosted) | Wait on provider events, do not speak |
| Transcript null | Ask caller to repeat, never guess |
| Refusal or opt-out | Terminal guidance, end_call, record DO_NOT_CALL |
| Call complete | end_call first, then record only what was observed |
