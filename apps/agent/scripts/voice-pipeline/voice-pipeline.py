import argparse
import atexit
import os
import subprocess
import sys
import tempfile
import time
import warnings
from pathlib import Path

try:
    import numpy as np
    import requests
    import sounddevice as sd
    import soundfile as sf
except ImportError as import_error:
    print(
        "Missing required packages. Install with: "
        "pip install kokoro soundfile torch numpy sounddevice faster-whisper requests",
        file=sys.stderr,
    )
    print(f"Import error: {import_error}", file=sys.stderr)
    sys.exit(1)

warnings.filterwarnings("ignore", category=FutureWarning)

DEFAULT_GGUF = r"F:\.cache\huggingface\hub\models\meta-llama--Llama-3.2-1B\Llama-3.2-1B-f16.gguf"
DEFAULT_LLAMA_SERVER = r"F:\llama-win-cuda-13.3\llama-server.exe"
DEFAULT_PORT = 8080
DEFAULT_KOKORO_DIR = r"F:\.cache\huggingface\hub\models\Kokoro-82M\snapshots\f3ff3571791e39611d31c381e3a41a3af07b4987"
DEFAULT_WHISPER_DIR = "whisper-models"
DEFAULT_VOICE = "af_heart"
SAMPLE_RATE_RECORD = 16000
SAMPLE_RATE_KOKORO = 24000
RECORD_CHUNK_SECONDS = 0.1
SILENCE_SECONDS = 1.5
MAX_RECORD_SECONDS = 15.0
SILENCE_THRESHOLD = 0.015

SYSTEM_PROMPT = (
    "You are a concise CRM voice assistant. Answer briefly, clearly and helpfully. "
    "Keep responses to one or two sentences when possible."
)


def parse_args():
    parser = argparse.ArgumentParser(description="Real-time voice pipeline POC")
    parser.add_argument("--gguf", default=DEFAULT_GGUF, help="Path to GGUF model")
    parser.add_argument("--llama-server", default=DEFAULT_LLAMA_SERVER, help="Path to llama-server.exe")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT, help="llama-server port")
    parser.add_argument("--kokoro-dir", default=DEFAULT_KOKORO_DIR, help="Kokoro-82M cache directory")
    parser.add_argument("--whisper-dir", default=DEFAULT_WHISPER_DIR, help="Directory to cache faster-whisper model")
    parser.add_argument("--voice", default=DEFAULT_VOICE, help="Kokoro voice name")
    return parser.parse_args()


def validate_paths(args):
    if not Path(args.llama_server).is_file():
        print(f"llama-server not found: {args.llama_server}", file=sys.stderr)
        sys.exit(1)
    if not Path(args.gguf).is_file():
        print(f"GGUF model not found: {args.gguf}", file=sys.stderr)
        sys.exit(1)
    for required in ("config.json", "kokoro-v1_0.pth", f"voices/{args.voice}.pt"):
        path = Path(args.kokoro_dir) / required
        if not path.is_file():
            print(f"Kokoro file not found: {path}", file=sys.stderr)
            sys.exit(1)


def start_llama_server(args):
    command = [
        args.llama_server,
        "-m", args.gguf,
        "--port", str(args.port),
        "-ngl", "99",
        "-c", "4096",
    ]
    print(f"Starting llama-server on port {args.port}...")
    process = subprocess.Popen(command)
    atexit.register(lambda: terminate_server(process))
    return process


def terminate_server(process):
    if process.poll() is None:
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()


def wait_for_health(port, timeout=60):
    url = f"http://127.0.0.1:{port}/health"
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            response = requests.get(url, timeout=2)
            if response.status_code == 200:
                print("llama-server is ready.")
                return
        except requests.RequestException:
            pass
        time.sleep(0.5)
    print("llama-server failed to become healthy.", file=sys.stderr)
    sys.exit(1)


def load_kokoro(kokoro_dir, voice):
    from kokoro import KModel, KPipeline
    import torch

    config_path = os.path.join(kokoro_dir, "config.json")
    model_path = os.path.join(kokoro_dir, "kokoro-v1_0.pth")
    voice_path = os.path.join(kokoro_dir, "voices", f"{voice}.pt")

    device = "cuda" if torch.cuda.is_available() else "cpu"
    model = KModel(repo_id="hexgrad/Kokoro-82M", config=config_path, model=model_path).to(device).eval()
    pipeline = KPipeline(lang_code="a", repo_id="hexgrad/Kokoro-82M", model=model)
    return pipeline, voice_path, device


def load_whisper(whisper_dir):
    from faster_whisper import WhisperModel

    model = WhisperModel("base.en", device="auto", download_root=whisper_dir)
    return model


def record_audio(sample_rate, silence_seconds, max_seconds, chunk_seconds, threshold):
    chunk_samples = int(chunk_seconds * sample_rate)
    silence_chunks = int(silence_seconds / chunk_seconds)
    max_chunks = int(max_seconds / chunk_seconds)

    print("Recording... (speak now)")
    chunks = []
    silent_count = 0

    with sd.InputStream(samplerate=sample_rate, channels=1, dtype=np.float32) as stream:
        for _ in range(max_chunks):
            chunk, _ = stream.read(chunk_samples)
            chunk = chunk.flatten()
            chunks.append(chunk)

            rms = np.sqrt(np.mean(chunk**2))
            if rms < threshold:
                silent_count += 1
            else:
                silent_count = 0

            if silent_count >= silence_chunks:
                break

    return np.concatenate(chunks)


def save_wav(audio, sample_rate, path):
    sf.write(path, audio, sample_rate)


def transcribe(whisper_model, audio_path):
    segments, _ = whisper_model.transcribe(audio_path, language="en")
    return " ".join(segment.text for segment in segments).strip()


def generate_response(transcript, port):
    if not transcript:
        return ""

    url = f"http://127.0.0.1:{port}/v1/chat/completions"
    payload = {
        "model": "local",
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": transcript},
        ],
        "temperature": 0.7,
        "max_tokens": 256,
    }
    response = requests.post(url, json=payload, timeout=60)
    response.raise_for_status()
    return response.json()["choices"][0]["message"]["content"].strip()


def synthesize(kokoro_pipeline, voice_path, text):
    segments = []
    for result in kokoro_pipeline(text, voice=voice_path, speed=1.0, split_pattern=r"\n+"):
        if result.audio is None:
            continue
        if hasattr(result.audio, "detach"):
            segments.append(result.audio.detach().cpu().numpy())
        else:
            segments.append(result.audio)

    if not segments:
        return np.array([], dtype=np.float32)

    return np.concatenate(segments)


def play_audio(audio, sample_rate):
    if audio.size == 0:
        return
    sd.play(audio, sample_rate)
    sd.wait()


def run_turn(whisper_model, kokoro_pipeline, voice_path, port):
    input("Press Enter to speak...")

    audio = record_audio(SAMPLE_RATE_RECORD, SILENCE_SECONDS, MAX_RECORD_SECONDS, RECORD_CHUNK_SECONDS, SILENCE_THRESHOLD)

    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as temp_file:
        temp_path = temp_file.name

    try:
        save_wav(audio, SAMPLE_RATE_RECORD, temp_path)
        transcript = transcribe(whisper_model, temp_path)
        print(f"You: {transcript}")

        if not transcript:
            return

        response = generate_response(transcript, port)
        print(f"Assistant: {response}")

        if not response:
            return

        audio_response = synthesize(kokoro_pipeline, voice_path, response)
        play_audio(audio_response, SAMPLE_RATE_KOKORO)
    finally:
        try:
            os.remove(temp_path)
        except OSError:
            pass


def main():
    args = parse_args()
    validate_paths(args)

    llama_process = start_llama_server(args)
    wait_for_health(args.port)

    print("Loading Kokoro TTS...")
    kokoro_pipeline, voice_path, _ = load_kokoro(args.kokoro_dir, args.voice)

    print("Loading faster-whisper...")
    whisper_model = load_whisper(args.whisper_dir)

    print("Voice pipeline ready. Ctrl+C to exit.")
    try:
        while True:
            run_turn(whisper_model, kokoro_pipeline, voice_path, args.port)
    except KeyboardInterrupt:
        print("\nStopping voice pipeline.")
    finally:
        terminate_server(llama_process)


if __name__ == "__main__":
    main()
