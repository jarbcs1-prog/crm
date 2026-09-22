---
name: voice-calling
description: Place and manage live voice calls to CRM contacts over the Nonoh SIP trunk. Use when the user or a task asks to cold-call, phone, ring, answer, transfer, or call a contact, verify a phone number by voice, or hold a spoken conversation on an outbound or inbound calling session. Requires NONOH_SIP_SERVER, NONOH_USERNAME and NONOH_PASSWORD.
---

# Voice Calling

Live voice calls to CRM contacts over Nonoh. Every call is recorded in the `call` table with an event trail in `callEvent`; never claim a call connected unless the SIP stack returns a final 200.

## Tools

- `make_call` — dials one contact over SIP and waits for the outcome. Creates the call as `CallStatus.QUEUED`, then on a real SIP 200 stores `sipCallId`, sets `IN_PROGRESS` with `answeredAt` and emits an `ANSWER` event. Returns `{ ok, callId, sipCallId, number, status }`; on refusal it returns the SIP status and a reason. Any other outcome (404 not found, 486 busy, 402/403 payment or forbidden, timeout, no media in the answer) leaves the row `FAILED` with a `SIP_ERROR` event.
- `speak_on_call` — says one short sentence on a live call. Input `{ callId, text }`; returns `{ spoken, reason? }`. Never throws: a missing or ended call comes back as `spoken: false` with a reason.
- `listen_on_call` — listens for the other party. Input `{ callId, maxMs? }`; returns `{ heard, transcript, seconds, reason? }`. The first 400 ms of captured audio is dropped because it is usually our own speech echoed back. `transcript: null` plus a reason means the audio was captured but not understood — the whisper server was unreachable, or none is configured. Never treat a null transcript as silence.
- `call_status` — short-circuits on terminal statuses; a live session is reported from its RTP counters (packets sent and received, remote media source, inbound peak) and SIP state instead of a provider API.
- `record_call_outcome` — persists the human outcome: enum value (`CONNECTED`, `VOICEMAIL`, `NO_ANSWER`, `WRONG_NUMBER`, `DO_NOT_CALL`, `INTERESTED`, `FOLLOW_UP`, `NOT_INTERESTED`, `MEETING_BOOKED`) or a legacy slug. Also writes CLID scores (0-1 each), `clidReadiness` = mean and a timeline note. `WRONG_NUMBER`/`DO_NOT_CALL` open an OSINT target marked `SKIPPED`.
- `schedule_calls` — enqueues outbound-call tasks for up to 5 contacts with phone numbers; the lane dials them. Never invents a phone number; a contact without one is skipped.
- `end_call` — sends a SIP BYE when the session still exists; marks the call `CANCELLED` unless already terminal and writes a `HANGUP` event with the duration. When the session is already gone it still closes the CRM record and says so.
- `answer_call` — answers an inbound call that is currently ringing. Updates the CRM call status to `IN_PROGRESS` and records an `ANSWER` event. Requires the call direction to be `INBOUND` and the call to have a `sipCallId`.
- `transfer_call` — transfers a live (`IN_PROGRESS`) or ringing (`RINGING`) call to another destination such as an extension, phone number, or user. Records a `TRANSFER` event with the destination.

## How a call is actually held

The line is **half-duplex**. `speak_on_call` plays a sentence to the end and only returns when the audio has drained; `listen_on_call` then opens one listening window. There is no barge-in: no streaming STT and no echo cancellation, so the agent cannot hear while it talks and cannot be interrupted mid-sentence. Plan turns as speak → listen → speak → listen, keep each spoken turn to one short sentence and let the caller finish — the listening window closes after a stretch of silence or at `maxMs`, whichever comes first.

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
- A 1xx provisional response (180 Ringing) is not a connection and neither is a timeout. Only SIP 200 with a media answer counts.
- A failed or silent whisper server means the words are unknown, not that nothing was said. Say so rather than guessing.

## Webhooks

The provider pipeline posts call lifecycle events to this channel (`/internal/voice/events`, Bearer `AGENT_BRIDGE_SECRET`). For Nonoh calls the SIP stack in `lib/telephony` is the source of truth; treat webhook events as a secondary trail and prefer `make_call`/`call_status`/`record_call_outcome` for your own actions.

## Provider notes

Nonoh only routes real E.164 destinations; off-net SIP URIs and echo services are refused with 404, so there is no test target — a real number is the only way to exercise the stack.

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

Holding one conversation:

1. `make_call` and check `ok` — anything else is a failure with a SIP reason, not a live line.
2. `speak_on_call` with the opener (who you are, which company).
3. `listen_on_call`; if `transcript` is null, ask the caller to repeat rather than inventing an answer.
4. Repeat 2 and 3 for each turn.
5. `end_call`, then `record_call_outcome` with what actually happened.

Inbound call:

1. `answer_call` on a ringing inbound call to pick it up.
2. `transfer_call` to hand the live call to another extension or user when requested.
3. `end_call` if the call needs to be terminated.
