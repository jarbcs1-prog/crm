---
name: voice-ai-cold-calling-research-first
description: Use when a live voice agent needs research-first discovery, qualification, consent-aware objection handling, or a post-demo follow-up for a CRM contact.
---

# Research-first live calls

Use this procedure for the conversation, not for audio transport or CRM state. The `voice-calling` skill explains the provider and tool mechanics. The typed voice tools are the source of truth for provider status, consent gates, refusal handling, and persistence.

## Operating boundary

- Identify yourself, the company you represent, and the purpose of the call truthfully.
- Say that the caller is speaking with an AI voice agent when disclosure is required by the pitch, workspace policy, or law. Never claim to be a human.
- Use only the offer, price, capability, and approved claim returned by `load_pitch` or the workspace. Do not invent prices, discounts, results, customer counts, or integrations.
- Do not request passwords, payment-card details, government identifiers, financial-account numbers, medical details, or other sensitive data.
- Silence, an unclear transcript, a qualified phrase, or a lack of objection is not consent. Treat an explicit opt-out as permanent.
- Do not disparage an existing provider. Ask what is working, what is not, and whether a change is wanted before comparing options.
- Do not claim a call connected, heard a response, booked a meeting, scheduled a follow-up, or sent a message unless the corresponding tool confirms it.

## Before dialing

1. For a research-first sales task, call `load_pitch` with pitchId `research-first-cold-call-v1` and pass verified `company_name` and `call_purpose` values from the workspace or task context. If those values are unavailable, do not invent them.
2. If the task uses a hosted provider such as Vapi, pass the assistant object returned by `load_pitch` to `make_call` when the tool requires one. Do not use local speak/listen assumptions for a queued hosted call.
3. Call `make_call` for the CRM contact. Use the stored number unless the task explicitly supplies a verified override. If it returns a refusal, missing number, invalid number, unavailable provider, or queued result, follow the returned reason instead of simulating a conversation.
4. For a live local session, confirm `answered: true` and an in-progress status before speaking. For a hosted call, use provider status and webhook events; never pretend a queued call is connected.

## Choose the conversation path

Choose one path from the evidence already available. Do not force a technique onto a caller who wants a different conversation.

- **Cold or lightly qualified contact:** use the research-survey reference. Ask permission, learn the caller's situation, and establish fit before offering a next step.
- **Post-demo or warm follow-up:** the customer-journey-mirror reference may help surface the caller's own priorities. It is optional, not a closing script.
- **Price-first or explicit service request:** answer from the loaded pitch, then qualify fit and timing. Do not delay a direct answer with a long discovery sequence.
- **Existing solution:** probe the current workflow and constraints before suggesting a change.
- **Urgent or human request:** offer the available escalation or transfer path without promising a person, time, or result that a tool has not confirmed.

## Research-first discovery

Ask one question at a time and adapt to the caller's language. The following are prompts, not a questionnaire to recite:

- How do new people usually find and contact the business?
- What happens when a contact reaches the business at a time when nobody can respond?
- What is the current process for following up, and where do leads usually go?
- What is an average successful customer or transaction worth to the business?
- Which part of the current process creates the most effort or uncertainty?
- What would a useful improvement need to accomplish, and by when?

Reflect the answer before asking the next question. Use the caller's own words. Ask only for information relevant to the loaded offer.

If the caller provides enough numbers, an estimate may help. State the inputs and label it as an estimate: "Using the numbers you gave me, that is roughly X per week; does that match your experience?" Do not insert market statistics or multiply unverified assumptions. Do not use a pain calculation to pressure someone who has declined.

## The live turn protocol

For a live local call, keep the turn boundary explicit:

1. Send one short, natural sentence with `speak_on_call`. Confirm the tool reports that it was spoken.
2. Call `listen_on_call` for one listening window. Do not speak over the caller; the line is half-duplex.
3. If the transcript is null, say that the audio was not understood and ask the caller to repeat. Never fill the gap with a guessed answer.
4. If the transcript seems out of context, confirm the intended words before acting. Do not interpret a possible transcription error as a medical, legal, financial, or safety statement.
5. Pass the `refusalBranches` returned by `load_pitch` to `listen_on_call` on every relevant turn. Follow the pitch's refusal, consent, terminal, and clarify guidance returned by the tool. A clarification request is not permission to continue a sensitive request.
6. Continue with another short speak/listen pair only while the caller is participating and the call is live.

Keep openings and handoffs short enough for a spoken turn. Do not read a long script, stack multiple questions, or speak pricing, legal promises, or technical claims that are not present in the loaded pitch.

## Objections and boundaries

- If the caller says they are not interested, stop the sales sequence. Ask whether a callback or written follow-up is wanted; do not infer either.
- If the caller asks to stop calling, is abusive, or invokes a do-not-contact instruction, follow the terminal guidance, end the call, and record `DO_NOT_CALL`. Do not ask for a referral.
- If the caller asks for a human, use the available transfer or escalation tool and state only what it returns.
- If the caller asks for a document, only continue when the tool has confirmed explicit prior consent for that document. Do not treat silence or a general “send it” answer as consent for a sensitive document.
- If the caller asks about pricing, quote the loaded pitch exactly or say that the price will be confirmed by the team. Never improvise a discount.
- If the caller disputes a transcription, pause the flow and confirm the disputed phrase.

## Close and record

Before ending, summarize the caller's request, interest, refusal, and any agreed next step in neutral language. Ask for a callback time only when the caller volunteers one; do not invent a time.

1. Use the pitch's terminal response and the tool's guidance when the call is finished.
2. Call `end_call` for a live session. Do not claim termination until it succeeds.
3. Call `record_call_outcome` with the actual observed outcome and a concise evidence-based summary. Map a booked appointment, follow-up, interest, refusal, no answer, or opt-out to the supported outcome values.
4. Schedule follow-up only when the caller agreed and the requested timing is known. A requested follow-up is not a scheduled follow-up until the scheduling tool confirms it.

## Quick reference

| Situation | Action |
| --- | --- |
| No pitch loaded | Call `load_pitch` and use the approved record. |
| Call not answered or queued | Do not speak; follow the returned status or provider event. |
| Transcript is null | Ask the caller to repeat; do not infer intent. |
| Existing provider | Probe the current process before comparing. |
| Price question | Use pitch data only; never invent or discount. |
| Refusal or opt-out | Follow terminal guidance, end, and record the outcome. |
| Consent-sensitive request | Require explicit prior affirmative consent and the tool's gate. |
| Call complete | End first, then record only what was observed. |

## References

- `references/research-survey.md` — adaptive discovery for cold and lightly qualified calls.
- `references/customer-journey-mirror.md` — optional reflection exercise for warm, post-demo calls.
- `references/live-call-quality.md` — voice quality, escalation, and transcript-safety rules.

These references contain conversation patterns, not pricing, product promises, or policy overrides. If they conflict with the loaded pitch or a tool result, follow the pitch and tool result.
