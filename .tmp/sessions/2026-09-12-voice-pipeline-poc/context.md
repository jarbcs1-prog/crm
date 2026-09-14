# Task Context: Voice Pipeline POC + Kokoro TTS + Call Tools

Session ID: 2026-09-12-voice-pipeline-poc
Created: 2026-09-12
Status: completed

## Current Request
Implement the approved voice/VoIP improvements:
1. Swap `edge-tts` for cached `Kokoro-82M` TTS in the agent voice layer.
2. Implement `answer_call` and `transfer_call` agent tools.
3. Wire the new tools into the voice-calling skill.
4. Build a real-time voice pipeline proof-of-concept using cached HuggingFace models and the installed llama.cpp (F:\llama-win-cuda-13.3, F:\llama_cpp, F:\llama.cpp).

Report back when successfully completed.

## Context Files (Standards to Follow)
- `/c/Users/PC Principal/.config/opencode/context/core/standards/code-quality.md` — pure functions, immutability, composition, small functions, explicit dependencies
- `/c/Users/PC Principal/.config/opencode/context/core/standards/project-intelligence.md`
- `/c/Users/PC Principal/.config/opencode/context/core/context-system/standards/mvi.md`

## Reference Files (Source Material to Look At)
- `F:/crm/apps/agent/agent/lib/voice.ts` — VoIPStudio client, TTS helper
- `F:/crm/apps/agent/agent/lib/capabilities.ts` — capability flags
- `F:/crm/apps/agent/agent/tools/make_call.ts` — existing call tool pattern
- `F:/crm/apps/agent/agent/tools/end_call.ts`
- `F:/crm/apps/agent/agent/tools/call_status.ts`
- `F:/crm/apps/agent/agent/channels/voice.ts` — webhook event normalization
- `F:/crm/apps/agent/agent/skills/voice-calling.md`
- `F:/crm/apps/agent/agent/agent.ts`
- `F:/crm/apps/agent/agent/lib/model.ts`
- `F:/crm/.env.example`
- `F:/crm/packages/db/prisma/schema.prisma` — Call, CallEvent models
- `F:/crm/apps/api/src/config/env.validation.ts`
- `F:/crm/apps/api/src/settings/model-catalog.service.ts`
- `F:/crm/apps/api/src/settings/settings.service.ts`
- `F:/crm/apps/app/app/(app)/settings/agent-model.tsx`
- `F:/crm/packages/db/src/settings.ts`

## External Docs Fetched
- `voice-agents` skill — latency budgets, VAD, barge-in, S2S vs pipeline
- `voice-ai-integration` skill — STT/LLM/TTS pipeline patterns
- `telecommunications-expert` skill — SIP/VoIP concepts
- `huggingface-local-models` skill — GGUF/llama.cpp usage
- `llmfit-advisor` skill — hardware-aware model recommendations

## Components
1. **Kokoro TTS Integration**
   - Python helper script (`apps/agent/agent/scripts/kokoro-tts.py`)
   - Update `apps/agent/agent/lib/voice.ts` `synthesizeSpeech`
   - Update `.env.example` (replace EDGE_TTS_VOICE with KOKORO_TTS_*)
   - Env vars discovered for this integration: `KOKORO_TTS_CACHE_DIR`, `KOKORO_TTS_VOICE`, `KOKORO_TTS_SPEED`
2. **`answer_call` Tool**
   - `apps/agent/agent/tools/answer_call.ts`
   - Uses `voice.ts` `answer()`
3. **`transfer_call` Tool**
   - `apps/agent/agent/tools/transfer_call.ts`
   - Uses `voice.ts` `transfer()`
4. **Skill Update**
   - Update `apps/agent/agent/skills/voice-calling.md`
5. **Voice Pipeline POC**
   - Python script using llama-server + faster-whisper + Kokoro
   - Launcher script + README
6. **Validation**
   - Type check apps/agent
   - Biome format/lint

## Constraints
- Do not add code comments (per AGENTS.md)
- Keep functions small and pure where possible
- Use existing patterns from make_call/end_call/call_status
- Prefer cached models from `F:\.cache\huggingface\hub\models`
- llama.cpp is already installed; do not reinstall
- All env vars must be documented in `.env.example`
- If API reads a new env var, declare it in `env.validation.ts` (agent-only vars may skip)

## Exit Criteria
- [ ] `edge-tts` replaced by Kokoro-82M in voice layer
- [ ] `answer_call.ts` and `transfer_call.ts` created and follow existing tool patterns
- [ ] `voice-calling.md` skill updated
- [ ] `.env.example` updated with new voice vars
- [ ] Voice pipeline POC script created with launcher + README
- [ ] `bunx tsc --noEmit` passes for `apps/agent`
- [ ] `biome check` passes (or formatted)
