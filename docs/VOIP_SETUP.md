# VOIP / Calling Setup

All calling features are optional. Missing keys remove the affected capability; an explicit request for an unconfigured provider is refused with a clear reason.

## Nonoh SIP (default outbound dialer)

```
NONOH_SIP_SERVER="sip.nonoh.net"
NONOH_SIP_PORT="5060"
NONOH_SIP_TLS="false"
NONOH_USERNAME=""
NONOH_PASSWORD=""
NONOH_DISPLAY_NAME=""
NONOH_STUN_SERVER="stun.nonoh.net"
NONOH_STUN_PORT="3478"
```

## VOIPStudio

```
VOIPSTUDIO_API_KEY=""
VOIPSTUDIO_CALLER_ID=""
VOIPSTUDIO_BASE_URL="https://l7api.com/v1.2/voipstudio"
```

The `/internal/voice/events` webhook is inert without these.

## PSTN alternatives

| Provider | Variables |
|---|---|
| Twilio | `TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN` + `TWILIO_CALLER_ID`, plus `TWILIO_TWIML_URL` or inline `TWILIO_TWIML` |
| Plivo | `PLIVO_AUTH_ID` + `PLIVO_AUTH_TOKEN` + `PLIVO_CALLER_ID` + `PLIVO_ANSWER_URL` |
| Vapi | `VAPI_API_KEY` + `VAPI_PHONE_NUMBER_ID` (+ `VAPI_ASSISTANT_ID`) |
| Telnyx | `TELNYX_API_KEY` + `TELNYX_CALLER_ID` |

Set SID+token together or not at all. Humans choose a default under **Settings → General**, and agents can pass a provider override to `make_call` (`nonoh`, `voipstudio`, `twilio`, `plivo`, or `vapi`). With no human default and no override, the first fully configured provider in the order Nonoh → VoIP Studio → Twilio → Plivo → Vapi is used. An unknown saved provider, a selected-but-unconfigured provider, and missing/invalid call-provider metadata all fail closed instead of silently switching providers. Phone numbers are normalized to E.164 before dialing; non-E.164 numbers, letters, and extensions are rejected in `schedule_calls`/`make_call` the same way. Vapi can receive the assistant object returned by `load_pitch`; without one, the call is refused before any request is placed.

The agent loads `voice-ai-cold-calling-research-first` for the conversation procedure and `voice-calling` for transport and CRM mechanics. Research-first sales tasks pin `load_pitch` to `research-first-cold-call-v1` and require verified `company_name` and `call_purpose` values; the pitch and workspace data remain the only sources for approved offer, pricing, verification, and policy wording. `make_call` must be treated as queued until it reports an answered local session; hosted providers are managed with `call_status` and do not support the local `speak_on_call`/`listen_on_call` path. Local calls are half-duplex: one short spoken turn, one listening window with the pitch's refusal and consent data, then interpret the transcript and returned guidance before continuing. `end_call` only closes a CRM call after a confirmed provider termination; failed or unidentifiable hangups remain retryable. Vapi termination uses the provider stop control, not resource deletion. The integrated system is **not approved for unattended live calling** until the safety gates in [`voice-ai-cold-calling-handoff.md`](./voice-ai-cold-calling-handoff.md) are enforced; use only a consented test contact for the documented smoke test.

For the current implementation status, verification evidence, and the exact controlled live-call resume procedure, see [`voice-ai-cold-calling-handoff.md`](./voice-ai-cold-calling-handoff.md).

## Qdrant (optional pitch-retrieval scale)

`QDRANT_URL` + `QDRANT_API_KEY` (set together or not at all). Agent-only: no API validation change. Unset and pitch retrieval still works from the checked-in files under `apps/agent/data` — a missing key removes scale, never the capability.

## Speech

| Service | Variable | Role |
|---|---|---|
| Kokoro TTS (local) | `KOKORO_TTS_CACHE_DIR` (`./.cache/huggingface/...`) | Synthesized speech |
| Deepgram | `DEEPGRAM_API_KEY` | Live transcription |
| ElevenLabs | `ELEVENLABS_API_KEY` | Natural voices |
| Cartesia | `CARTESIA_API_KEY` | Low-latency TTS |
| Faster Whisper | `FASTER_WHISPER_URL` | Local STT server |

## Graceful degradation

`apps/agent/agent/lib/capabilities.ts` is the single source of truth — it prints enabled/disabled capabilities at startup and tools check before charging the research budget. `apps/agent/agent/scripts/voice-pipeline/README.md` documents the voice POC pipeline.
