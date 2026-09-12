---
name: voice-calling
description: Place and manage live voice calls to CRM contacts through VoIPStudio. Use when the user or a task asks to cold-call, phone, ring, answer, transfer, or call a contact, verify a phone number by voice, or handle an outbound or inbound calling session. Requires VOIPSTUDIO_API_KEY.
---

# Voice Calling

Live voice calls to CRM contacts. Every call is recorded in the `call` table with an event trail in `callEvent`; never claim a call connected unless the provider or a status webhook proves it.

## Tools

- `make_call` — dials one contact. Queue first (`CallStatus.QUEUED`), then posts `POST /calls`; on success stores the provider call id in `Call.sipCallId`, status `RINGING`, and emits a `RING` event. Returns the call id.
- `call_status` — short-circuits on terminal statuses; otherwise asks the provider and reports the current state.
- `record_call_outcome` — persists the human outcome: enum value (`CONNECTED`, `VOICEMAIL`, `NO_ANSWER`, `WRONG_NUMBER`, `DO_NOT_CALL`, `INTERESTED`, `FOLLOW_UP`, `NOT_INTERESTED`, `MEETING_BOOKED`) or a legacy slug. Also writes CLID scores (0-1 each), `clidReadiness` = mean, and a timeline note. `WRONG_NUMBER`/`DO_NOT_CALL` open an OSINT target marked `SKIPPED`.
- `schedule_calls` — enqueues outbound-call tasks for up to 5 contacts with phone numbers; the lane dials them. Never invents a phone number; a contact without one is skipped.
- `end_call` — best-effort hangup; marks the call `CANCELLED` unless already terminal and writes a `HANGUP` event with the duration.
- `answer_call` — answers an inbound call that is currently ringing. Updates the CRM call status to `IN_PROGRESS` and records an `ANSWER` event. Requires the call direction to be `INBOUND` and the call to have a `sipCallId`.
- `transfer_call` — transfers a live (`IN_PROGRESS`) or ringing (`RINGING`) call to another destination such as an extension, phone number, or user. Records a `TRANSFER` event with the destination.

## Mapping live outcomes to stored values

- appointment scheduled → `MEETING_BOOKED`
- asked for callback / qualified with concerns → `FOLLOW_UP`
- qualified, no meeting yet → `INTERESTED`
- not interested → `NOT_INTERESTED`
- not viable / abusive / never call again → `DO_NOT_CALL` (permanent)
- no answer → `NO_ANSWER`

## Honesty rules

- Never fabricate an answered call, a transcript, an outcome, or a duration.
- No phone number on the contact → do not improvise; skip and note it.
- `DO_NOT_CALL` is permanent; do not schedule, call, or re-verify that contact.
- Identify yourself and the company at the start of every call.
- Respect the human: end the call when asked, no pressure, no claims you cannot back.

## Webhooks

The provider pipeline posts call lifecycle events to this channel (`/internal/voice/events`, Bearer `AGENT_BRIDGE_SECRET`). They update the call status and append to the event trail automatically — treat what the webhook says as ground truth and prefer `make_call`/`call_status`/`record_call_outcome` for your own actions.

## Text-to-speech

Call audio is synthesized with the local `Kokoro-82M` model, not edge-tts. Configure it with:

- `KOKORO_TTS_VOICE` — voice id; defaults to `af_heart`
- `KOKORO_TTS_SPEED` — playback speed; defaults to `1.0`
- `KOKORO_TTS_CACHE_DIR` — path to the cached Kokoro-82M model; defaults to `F:\.cache\huggingface\hub\models\Kokoro-82M\snapshots\f3ff3571791e39611d31c381e3a41a3af07b4987`

## Example flows

Outbound batch:

1. `schedule_calls` for a batch of contacts.
2. `call_status` on an in-flight call when the lane asks.
3. After the call, `record_call_outcome` with what actually happened; capture a summary and the CLID scores.

Inbound call:

1. `answer_call` on a ringing inbound call to pick it up.
2. `transfer_call` to hand the live call to another extension or user when requested.
3. `end_call` if the call needs to be terminated.
