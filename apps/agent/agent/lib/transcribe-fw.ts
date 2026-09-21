export async function transcribe(input: {
	data: Blob;
	mime: string;
}): Promise<string | null> {
	const tempDir = process.env.TEMP || process.env.TMP || "C:/Users/PC Principal/AppData/Local/Temp";
	const wavPath = `${tempDir}/crm_stt_${crypto.randomUUID()}.wav`;

	try {
		// Write WAV to temp file
		const fs = await import("node:fs");
		fs.writeFileSync(wavPath,Buffer.from(await input.data.arrayBuffer()));

		// Use Faster-Whisper standalone CLI as fallback (more reliable than DeepGram)
		const fwPath = "F:/Faster-Whisper-XXL/faster-whisper-xxl.exe";
		const ffmpegPath = "F:/Faster-Whisper-XXL/ffmpeg.exe";

		// Convert to 16kHz mono WAV for Faster-Whisper if needed
		const convertedPath = wavPath + ".16k.wav";
		const convertProc = spawn(ffmpegPath, [
			"-i", wavPath,
			"-ac", "1",
			"-ar", "16000",
			"-y",
			convertedPath,
		], { stdio: ["pipe", "pipe", "pipe"], timeout: 30_000 });

		let converted = wavPath;
		const [convertResult] = await new Promise<[number | null, string]>((resolve) => {
			let err = "";
			convertProc.stderr?.on("data", (d) => (err += d.toString()));
			convertProc.on("close", (code) => resolve([code, err]));
			convertProc.on("error", (e) => resolve([null, e.message]));
		});

		if (convertResult === 0) {
			converted = convertedPath;
		} else {
			console.log("Faster-Whisper: ffmpeg conversion skipped (using original):", convertResult, err.slice(0, 100));
		}

		// Run Faster-Whisper transcription
		const transcribeProc = spawn(fwPath, [
			converted,
			"--model", "medium",
			"--language", "en",
			"--output_format", "txt",
			"--output_dir", tempDir,
			"--verbose", "0",
		], { stdio: ["pipe", "pipe", "pipe"], timeout: 120_000 });

		const output = `${tempDir}/crm_stt_output.txt`;
		const [exitCode, stderr] = await new Promise<[number | null, string]>((resolve) => {
			let err = "";
			transcribeProc.stdout?.on("data", (d) => {
				// Faster-Whisper writes transcript to stdout when --output_format txt
			});
			transcribeProc.stderr?.on("data", (d) => (err += d.toString()));
			transcribeProc.on("close", (code) => resolve([code, err]));
			transcribeProc.on("error", (e) => resolve([null, e.message]));
		});

		if (exitCode !== 0) {
			console.log("Faster-Whisper exit code:", exitCode, "stderr:", stderr.slice(0, 200));
			return null;
		}

		// Read the output file
		if (fs.existsSync(output)) {
			const transcript = fs.readFileSync(output, "utf-8").trim();
			fs.unlinkSync(output);
			return transcript || null;
		}

		// Fallback: try reading stdout
		return null;
	} catch (e) {
		console.log("Faster-Whisper transcribe error:", e);
		return null;
	} finally {
		// Cleanup temp files
		try {
			const fs = await import("node:fs");
			const tempDir = process.env.TEMP || process.env.TMP || "C:/Users/PC Principal/AppData/Local/Temp";
			const files = [wavPath, wavPath + ".16k.wav"];
			for (const f of files) {
				if (fs.existsSync(f)) fs.unlinkSync(f);
			}
		} catch {}
	}
}

// Keep the DeepGram version as primary (if key is available)
export async function transcribeDeepGram(input: {
	data: Blob;
	mime: string;
}): Promise<string | null> {
	const apiKey = process.env.DEEPGRAM_API_KEY?.trim();
	if (!apiKey) return null;

	const form = new FormData();
	const ext = input.mime.includes("wav") ? "wav" : "webm";
	form.append("file", input.data, `recording.${ext}`);

	const response = await fetch(
		`https://api.deepgram.com/v1/listen?model=aura-asteria-en&smart_format=json`,
		{
			method: "POST",
			headers: {
				"Authorization": `Token ${apiKey}`,
			},
			body: form,
		},
	);

	if (!response.ok) return null;

	const text = await response.text();
	try {
		const parsed = JSON.parse(text);
		if (parsed.results?.channels?.[0]?.alternatives?.[0]?.transcript) {
			return parsed.results.channels[0].alternatives[0].transcript;
		}
		if (typeof parsed.transcript === "string") return parsed.transcript;
		console.log("DeepGram unexpected response:", text.slice(0, 300));
		return null;
	} catch {
		return null;
	}
}
