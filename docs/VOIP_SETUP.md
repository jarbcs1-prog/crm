# VOIP / Calling Setup

All calling features are optional. Missing keys degrade gracefully — the capability is reported as unavailable, never an error.

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
| Twilio | `TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN` + `TWILIO_CALLER_ID` |
| Telnyx | `TELNYX_API_KEY` + `TELNYX_CALLER_ID` |

Set SID+token together or not at all.

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
