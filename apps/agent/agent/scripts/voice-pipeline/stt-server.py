import os
import tempfile

import uvicorn
from fastapi import FastAPI, File, Form, UploadFile
from fastapi.responses import PlainTextResponse
from faster_whisper import WhisperModel

DEFAULT_MODEL_DIR = os.path.join(
	os.path.dirname(os.path.abspath(__file__)),
	"whisper-models",
	"models--Systran--faster-whisper-base.en",
	"snapshots",
	"3d3d5dee26484f91867d81cb899cfcf72b96be6c",
)

MODEL_DIR = os.environ.get("STT_MODEL_DIR") or DEFAULT_MODEL_DIR

SUFFIXES = (
	("webm", ".webm"),
	("mp3", ".mp3"),
	("mpeg", ".mp3"),
	("ogg", ".ogg"),
	("mp4", ".mp4"),
	("wav", ".wav"),
)

model = WhisperModel(
	MODEL_DIR, device="cpu", compute_type="int8", local_files_only=True
)

app = FastAPI()


def suffix_for(filename: str | None, content_type: str | None) -> str:
	haystack = f"{filename or ''} {content_type or ''}".lower()
	for needle, suffix in SUFFIXES:
		if needle in haystack:
			return suffix
	return ".wav"


@app.get("/health")
async def health():
	return {"ok": True, "model": MODEL_DIR}


@app.post("/v1/audio/transcriptions")
async def transcribe(
	file: UploadFile = File(...),
	response_format: str = Form("json"),
):
	path = None
	try:
		with tempfile.NamedTemporaryFile(
			delete=False, suffix=suffix_for(file.filename, file.content_type)
		) as handle:
			path = handle.name
			handle.write(await file.read())
		segments, _info = model.transcribe(path, language="en", beam_size=1)
		text = "".join(segment.text for segment in segments).strip()
	finally:
		if path and os.path.exists(path):
			os.remove(path)

	if response_format == "text":
		return PlainTextResponse(text)
	return {"text": text}


if __name__ == "__main__":
	uvicorn.run(
		app,
		host=os.environ.get("STT_HOST", "127.0.0.1"),
		port=int(os.environ.get("STT_PORT", "8000")),
	)
