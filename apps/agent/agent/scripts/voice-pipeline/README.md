# Voice Pipeline POC

A local, real-time voice assistant proof-of-concept that runs entirely on cached models and llama.cpp.

## What it demonstrates

- Record speech from your microphone
- Transcribe with faster-whisper
- Generate a concise CRM-style response with a local Llama model via llama-server
- Synthesize speech with Kokoro-82M
- Play the reply through your speakers

## Hardware requirements

- Microphone and speakers
- Windows with a CUDA GPU recommended (the launcher uses `-ngl 99`)
- Enough VRAM/RAM for the chosen GGUF model

## Required Python packages

```powershell
pip install kokoro soundfile torch numpy sounddevice faster-whisper requests
```

The launcher checks for these and prints the command if any are missing.

## Run with defaults

```powershell
cd apps\agent\agent\scripts\voice-pipeline
.\launch-voice-pipeline.ps1
```

## Run with custom paths

```powershell
.\launch-voice-pipeline.ps1 `
    -LlamaServer "F:\llama-win-cuda-13.3\llama-server.exe" `
    -Gguf "F:\.cache\huggingface\hub\models\meta-llama--Llama-3.2-1B\Llama-3.2-1B-f16.gguf" `
    -KokoroDir "F:\.cache\huggingface\hub\models\Kokoro-82M\snapshots\f3ff3571791e39611d31c381e3a41a3af07b4987"
```

## First run notes

- faster-whisper downloads the `base.en` model into a local `whisper-models/` directory on first run.
- Kokoro may download the `en_core_web_sm` spaCy model on first run for phonemization.
- Subsequent runs use the cached weights and models.

## Cached models used

- **LLM**: `meta-llama/Llama-3.2-1B` GGUF from `F:\.cache\huggingface\hub\models\meta-llama--Llama-3.2-1B`
- **TTS**: `hexgrad/Kokoro-82M` from `F:\.cache\huggingface\hub\models\Kokoro-82M\snapshots\f3ff3571791e39611d31c381e3a41a3af07b4987`
- **STT**: faster-whisper `base.en` cached in `whisper-models/`

## Usage

Press Enter to start recording, speak and wait for the assistant to reply. Press Ctrl+C to stop.

## Files

- `voice-pipeline.py` — main script
- `launch-voice-pipeline.ps1` — Windows launcher with default paths
- `README.md` — this file
