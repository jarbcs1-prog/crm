import argparse
import json
import os
import sys
from typing import NoReturn

try:
	from kokoro import KModel, KPipeline
	import soundfile as sf
	import torch
	import numpy as np
except ImportError:
	print("kokoro and its dependencies (soundfile, torch, numpy) are required.", file=sys.stderr)
	print("Install with: pip install kokoro soundfile torch numpy", file=sys.stderr)
	sys.exit(1)

SAMPLE_RATE = 24000
REPO_ID = "hexgrad/Kokoro-82M"


def parse_args():
	parser = argparse.ArgumentParser()
	parser.add_argument("--text")
	parser.add_argument("--output")
	parser.add_argument("--voice", default="af_heart")
	parser.add_argument("--speed", type=float, default=1.0)
	parser.add_argument("--cache-dir", default=r"F:\.cache\huggingface\hub\models\Kokoro-82M\snapshots\f3ff3571791e39611d31c381e3a41a3af07b4987")
	parser.add_argument("--serve", action="store_true")
	parser.add_argument("--output-sample-rate", type=int, default=SAMPLE_RATE)
	return parser.parse_args()


def require_files(paths):
	for required in paths:
		if not os.path.isfile(required):
			raise ValueError(f"Required file not found in cache dir: {required}")


def fatal(error) -> NoReturn:
	sys.exit(str(error))


def cache_paths(cache_dir):
	return (
		os.path.join(cache_dir, "config.json"),
		os.path.join(cache_dir, "kokoro-v1_0.pth"),
	)


def voice_path(cache_dir, voice):
	return os.path.join(cache_dir, "voices", f"{voice}.pt")


def load_pipeline(cache_dir):
	config_path, model_path = cache_paths(cache_dir)
	require_files((config_path, model_path))

	device = "cuda" if torch.cuda.is_available() else "cpu"
	model = KModel(repo_id=REPO_ID, config=config_path, model=model_path).to(device).eval()
	return KPipeline(lang_code="a", repo_id=REPO_ID, model=model)


def synthesise(pipeline, text, voice_path, speed):
	segments = []
	for result in pipeline(text, voice=voice_path, speed=speed, split_pattern=r"\n+"):
		if result.audio is None:
			continue
		audio = result.audio
		if hasattr(audio, "detach"):
			audio = audio.detach().cpu().numpy()
		audio = np.asarray(audio, dtype=np.float32)
		if audio.ndim > 1:
			audio = audio.mean(axis=-1)
		segments.append(audio.reshape(-1))

	if not segments:
		return None
	return np.concatenate(segments)


def decimate(audio, factor):
	n = 64 * max(1, factor // 3)
	fc = 0.9 / factor
	t = np.arange(n) - (n - 1) / 2
	h = np.sinc(2 * fc * t) * np.hamming(n)
	h = h / h.sum()
	return np.asarray(np.convolve(audio, h, mode="same")[::factor], dtype=np.float32)


def resample(audio, target_rate):
	if target_rate == SAMPLE_RATE:
		return audio

	factor = SAMPLE_RATE / target_rate
	if factor <= 0:
		raise ValueError(f"unsupported output sample rate: {target_rate}")

	nearest = round(factor)
	if nearest >= 1 and abs(factor - nearest) < 1e-9:
		return decimate(audio, nearest)

	if audio.size < 2:
		return audio

	length = max(1, int(round(audio.size / factor)))
	source = np.arange(audio.size)
	return np.asarray(
		np.interp(np.linspace(0.0, audio.size - 1, length), source, audio),
		dtype=np.float32,
	)


def write_wav(path, audio, sample_rate):
	os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
	sf.write(path, audio, sample_rate, subtype="PCM_16")


def render(pipeline, cache_dir, text, voice, speed, output, sample_rate):
	path = voice_path(cache_dir, voice)
	require_files((path,))

	audio = synthesise(pipeline, text, path, speed)
	if audio is None:
		raise ValueError("No audio was generated.")

	audio = resample(audio, sample_rate)
	write_wav(output, audio, sample_rate)
	return float(audio.size) / float(sample_rate)


def handle_request(pipeline, args, line):
	request_id = None
	try:
		request = json.loads(line)
		if not isinstance(request, dict):
			raise ValueError("request must be a JSON object")

		request_id = request.get("id")
		text = request.get("text")
		output = request.get("output")

		if not isinstance(text, str) or text.strip() == "":
			raise ValueError("request is missing text")
		if not isinstance(output, str) or output.strip() == "":
			raise ValueError("request is missing output")

		voice = request.get("voice") or args.voice
		speed = float(request.get("speed") or args.speed)
		sample_rate = int(request.get("sample_rate") or args.output_sample_rate)

		seconds = render(pipeline, args.cache_dir, text, voice, speed, output, sample_rate)
		return {"id": request_id, "ok": True, "path": output, "seconds": seconds}
	except Exception as error:
		return {"id": request_id, "ok": False, "error": str(error)}


def emit(response):
	sys.stdout.write(json.dumps(response) + "\n")
	sys.stdout.flush()


def serve(args):
	try:
		pipeline = load_pipeline(args.cache_dir)
	except ValueError as error:
		fatal(error)

	while True:
		line = sys.stdin.readline()
		if not line:
			break
		line = line.strip()
		if not line:
			continue
		emit(handle_request(pipeline, args, line))


def main():
	args = parse_args()

	os.environ.setdefault("HF_HUB_OFFLINE", "1")

	if args.serve:
		serve(args)
		return

	if not args.text:
		print("--text is required.", file=sys.stderr)
		sys.exit(2)
	if not args.output:
		print("--output is required.", file=sys.stderr)
		sys.exit(2)

	voice = voice_path(args.cache_dir, args.voice)
	try:
		require_files((voice,))
		pipeline = load_pipeline(args.cache_dir)
	except ValueError as error:
		fatal(error)

	audio = synthesise(pipeline, args.text, voice, args.speed)
	if audio is None:
		fatal("No audio was generated.")

	audio = resample(audio, args.output_sample_rate)
	write_wav(args.output, audio, args.output_sample_rate)


if __name__ == "__main__":
	main()
