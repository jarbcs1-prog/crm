# Voice Pipeline POC — Discovery Note

## 1. Agent tool registration

- `apps/agent/agent/agent.ts` only imports capabilities, the dynamic model selector, and `defineAgent` from `eve`. It does **not** import tools explicitly.
- eve discovers tools by filename under `agent/tools/`. `agent/tools/make_call.ts` becomes the `make_call` tool, `agent/tools/end_call.ts` becomes `end_call`, etc. (confirmed in `node_modules/eve/docs/tools/overview.mdx` and `project-structure.mdx`).
- Each tool file exports a default `defineTool({ ... })` from `eve/tools` with `description`, `inputSchema` (Zod), and `execute`.
- New call-control tools should follow the same pattern: create `agent/tools/answer_call.ts` and `agent/tools/transfer_call.ts`, no registration step required.
- Skills are similarly discovered from `agent/skills/` by filename; `agent/skills/voice-calling.md` is loaded on demand via `load_skill`.

## 2. `apps/agent/agent/lib/voice.ts`

Confirmed exported functions:

- `makeCall`, `webcall`, `getCall`, `hangup`, `transfer`, `answer`
- `callApi`, `callCode`, `isTerminalStatus`, `transcribe`, `synthesizeSpeech`
- Config helpers: `voiceApiKey`, `voiceBaseUrl`, `callerId`, `isVoiceConfigured`, `voiceRecordingsDir`, `recordingPath`

Both `answer(sipCallId)` and `transfer(sipCallId, destination)` are present and call VoIPStudio's `/calls/{id}` PATCH endpoint. `answer` sends `{ state: "answer" }`; `transfer` sends `{ dst: destination }`.

Current TTS uses `edge-tts` CLI spawned from `synthesizeSpeech`. `EDGE_TTS_VOICE` is read from env.

## 3. Python environment

Direct shell execution (`python --version`, `pip list`) was not available in this environment, so the exact runtime version and installed packages could not be sampled live.

Evidence gathered from the filesystem:

- `apps/agent/` contains **no** `.py` files, `requirements.txt`, or `pyproject.toml`.
- `F:\llama-win-cuda-13.3\python_workers.py` is an existing Python-tier stub that explicitly states: "Heavy deps (torch/transformers/PEFT/Kokoro/whisper) NOT installed in v1."
- `F:\llama-win-cuda-13.3\README.md` targets Python 3.12+ and says the pool itself is stdlib-only, while the Python tier (TTS/ASR/classifiers) requires the heavy deps.
- `F:\llama-win-cuda-13.3\llm-launcher\requirements.txt` lists only `gguf_parser`, `gradio`, `Jinja2`, `requests` — unrelated to voice.

Inference: the voice POC will need to install torch, transformers, Kokoro, faster-whisper, sounddevice, numpy, and requests into the Python environment before the real-time pipeline can run. The current environment has the llama.cpp binaries but not the Python ML stack.

## 4. Cached model paths

Verified on disk:

| Model | Path |
|-------|------|
| Kokoro-82M checkpoint | `F:\.cache\huggingface\hub\models\Kokoro-82M\snapshots\f3ff3571791e39611d31c381e3a41a3af07b4987\kokoro-v1_0.pth` |
| Kokoro voices dir | `F:\.cache\huggingface\hub\models\Kokoro-82M\snapshots\f3ff3571791e39611d31c381e3a41a3af07b4987\voices\` |
| Llama-3.2-1B GGUF | `F:\.cache\huggingface\hub\models\meta-llama--Llama-3.2-1B\Llama-3.2-1B-f16.gguf` |
| Llama-3.2-3B GGUF | `F:\.cache\huggingface\hub\models\unsloth\Llama-3.2-3B-Instruct-fp16\unsloth-Llama-3.2-3B-Instruct-f16.gguf` |
| faster-whisper model | **Not found** in `F:\.cache\huggingface\hub\models` under common names (`large-v3`, `medium`, `small`, `base`, `tiny`, `distil*`). The POC will need to download or point to a whisper/faster-whisper checkpoint. |
| llama.cpp server binary | `F:\llama-win-cuda-13.3\llama-server.exe` |

## 5. Relevant env vars (from `.env.example`)

- `VOIPSTUDIO_API_KEY`, `VOIPSTUDIO_CALLER_ID`, `VOIPSTUDIO_BASE_URL`
- `EDGE_TTS_VOICE` (to be replaced by Kokoro config)
- `VOICE_RECORDINGS_DIR`
- `FASTER_WHISPER_URL`
- `LLAMA_CPP_BASE_URL`

## 6. Summary for implementation

- Create `answer_call.ts` and `transfer_call.ts` under `apps/agent/agent/tools/`; they will be auto-discovered.
- Both should mirror `end_call.ts`/`call_status.ts`: look up the CRM `call` record by `callId`, validate status, call `answer` or `transfer` from `lib/voice.ts`, persist events, and return structured results.
- Replace `edge-tts` usage in `lib/voice.ts` `synthesizeSpeech` with a spawn of a new Python helper (`apps/agent/agent/scripts/kokoro-tts.py`) that loads Kokoro-82M from the cached path.
- The real-time voice pipeline POC will need to install the missing Python packages and either download a faster-whisper model or document where to place one.
