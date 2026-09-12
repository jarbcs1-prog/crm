import argparse
import os
import sys

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
	parser.add_argument("--text", required=True)
	parser.add_argument("--output", required=True)
	parser.add_argument("--voice", default="af_heart")
	parser.add_argument("--speed", type=float, default=1.0)
	parser.add_argument("--cache-dir", default=r"F:\.cache\huggingface\hub\models\Kokoro-82M\snapshots\f3ff3571791e39611d31c381e3a41a3af07b4987")
	return parser.parse_args()


def main():
	args = parse_args()

	os.environ.setdefault("HF_HUB_OFFLINE", "1")

	config_path = os.path.join(args.cache_dir, "config.json")
	model_path = os.path.join(args.cache_dir, "kokoro-v1_0.pth")
	voice_path = os.path.join(args.cache_dir, "voices", f"{args.voice}.pt")

	for required in (config_path, model_path, voice_path):
		if not os.path.isfile(required):
			print(f"Required file not found in cache dir: {required}", file=sys.stderr)
			sys.exit(1)

	device = "cuda" if torch.cuda.is_available() else "cpu"
	model = KModel(repo_id=REPO_ID, config=config_path, model=model_path).to(device).eval()
	pipeline = KPipeline(lang_code="a", repo_id=REPO_ID, model=model)

	segments = []
	for result in pipeline(args.text, voice=voice_path, speed=args.speed, split_pattern=r"\n+"):
		if result.audio is not None:
			if hasattr(result.audio, "detach"):
				segments.append(result.audio.detach().cpu().numpy())
			else:
				segments.append(result.audio)

	if not segments:
		print("No audio was generated.", file=sys.stderr)
		sys.exit(1)

	os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)
	sf.write(args.output, np.concatenate(segments), SAMPLE_RATE)


if __name__ == "__main__":
	main()
