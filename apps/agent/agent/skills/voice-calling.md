---
name: voice-calling
description: Use when placing, managing, or holding live voice calls for CRM contacts, including outbound or inbound sales qualification, transfers, provider lifecycle checks, or scheduling a follow-up.
---

# Voice Calling

This skill covers call transport and CRM state. For a sales conversation, first load `voice-ai-cold-calling-research-first` with `load_skill`; use that skill for discovery, positioning, consent-aware responses, and qualification. Research-first sales tasks use the pinned `research-first-cold-call-v1` pitch and its returned refusal branches.

A call is a conversation only after the tool reports a live or answered state. Provider events update queued calls asynchronously. Never infer a connection, transcript, duration, or outcome.

## Tools

- `make_call` — place a call for a CRM contact using the selected or explicitly requested provider. It validates the stored number, E.164 formatting, and optional OSINT viability. Nonoh returns a local answered session; hosted providers return a queued call. For Vapi, pass the assistant returned by `load_pitch` when the selected pitch requires it.
- `speak_on_call` — speak one short sentence on a live local session. Document requests require explicit prior affirmative consent in both the request flags and the conversation.
- `listen_on_call` — open one listening window after a spoken turn. A null transcript means the words are unknown, not that the caller was silent. Follow any returned refusal, clarification, or terminal guidance.
- `call_status` — inspect provider and CRM status. A queued or ringing hosted call is not yet a live conversation.
- `record_call_outcome` — store the observed outcome, summary, qualification signals, and follow-up state. `DO_NOT_CALL` is permanent.
- `schedule_calls` — queue up to 60 validated contacts. A missing or invalid number is skipped; no number is invented.
- `end_call` — close a local session or hosted provider call and wait for the termination result. A retryable failure leaves the call live.
- `answer_call` — answer a ringing inbound CRM call.
- `transfer_call` — transfer a ringing or live call to an approved destination when the caller requests it and policy permits it.

## Call procedure

1. Read the task and contact record. If the task is a sales qualification, load `voice-ai-cold-calling-research-first` before dialing.
2. Load `research-first-cold-call-v1` with `load_pitch` for a research-first sales task. Pass verified `company_name` and `call_purpose` values from the workspace or task context; if either is missing, do not invent it. Treat the pitch and workspace data as the only sources for offer, price, verification, and policy claims.
3. Call `make_call` and inspect the result. Do not claim a live line for a queued or failed result. If a hosted provider is selected, wait for provider status rather than calling local speech tools.
4. For a local live call, keep the exchange half-duplex: one short `speak_on_call` sentence, then one `listen_on_call` window with the loaded pitch's `refusalBranches` and `consentRules` supplied on every relevant turn. Repeat only after interpreting the transcript and any returned guidance.
5. Confirm an unexpected or contextually wrong transcription before acting. Never treat silence, ambiguity, or a failed transcription as consent.
6. Respect an opt-out or terminal response. Say the closing before ending when guidance requires it, call `end_call`, and only then close the CRM state with `record_call_outcome`.
7. Schedule a callback only when the caller gives a usable time and the policy permits it. Do not promise a transfer, timing, price, or result that the tools or pitch cannot support.

## Honesty and consent

- Identify the agent, principal, company, and purpose truthfully. If asked, disclose that the caller is speaking with an AI voice agent.
- Do not collect passwords, payment-card numbers, government identifiers, financial account details, or other unnecessary sensitive data. Follow the consent required by `speak_on_call` for documents or restricted requests.
- Probe an existing solution before comparing it. Do not badmouth competitors or claim a result that has not been verified.
- A second clear refusal ends the pitch. Do not pressure, disguise a refusal, or repeatedly ask for a referral.
- `DO_NOT_CALL` is permanent. Do not reschedule or re-verify that contact.
- Only a confirmed provider termination changes a call to ended. A failed end request is not a completed goodbye.

## Provider and speech notes

The configured provider controls routing. Nonoh uses the local RTP/SIP session and supports `speak_on_call` and `listen_on_call`; VoIP Studio, Twilio, Plivo, and Vapi are hosted integrations and report lifecycle state asynchronously. Missing credentials remove that capability and return a reason; they do not make unrelated tools fail.

Local speech is synthesized by the configured TTS path, including Kokoro when enabled. Recognition may use the configured local or hosted provider. Do not expose provider secrets or return raw audio in CRM notes.

## Example: local outbound call

1. `load_skill` for the research-first procedure and `load_pitch` if the pitch supplies approved wording.
2. `make_call`; continue only when the result confirms an answered local session.
3. `speak_on_call` one identity/purpose sentence, then `listen_on_call`.
4. Use the research-first skill to choose the next question; do not recite a fixed script when the caller gives a different signal.
5. On a terminal response, speak the required closing, `end_call`, and `record_call_outcome`.
6. On an unknown transcript, ask the caller to repeat once; do not invent their answer.

## Example: hosted call

1. `make_call` with the selected provider and the required assistant object.
2. If the result is queued, use `call_status` after provider events and do not use local speech tools.
3. Record only the provider-confirmed outcome and any CRM-safe follow-up details.
