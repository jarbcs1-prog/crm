import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { basename } from "node:path";
import { fileURLToPath } from "node:url";
import { CallStatus } from "@crm/db";
import { nonohConfigured, nonohMakeCall } from "./nonoh-sip";

const DEFAULT_BASE_URL = "https://l7api.com/v1.2/voipstudio";

const TERMINAL = new Set<CallStatus>([
	CallStatus.COMPLETED,
	CallStatus.FAILED,
	CallStatus.NO_ANSWER,
	CallStatus.BUSY,
	CallStatus.CANCELLED,
]);

export function voiceApiKey(): string | undefined {
	const key = process.env.VOIPSTUDIO_API_KEY?.trim();
	return key && key.length > 0 ? key : undefined;
}

export function voiceBaseUrl(): string {
	return (process.env.VOIPSTUDIO_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(
		/\/+$/,
		"",
	);
}

export function callerId(): string | undefined {
	const id = process.env.VOIPSTUDIO_CALLER_ID?.trim();
	return id && id.length > 0 ? id : undefined;
}

export function isVoiceConfigured(): boolean {
	return voiceApiKey() !== undefined;
}

export function isNonohConfigured(): boolean {
	return nonohConfigured();
}

export function isAnyVoiceConfigured(): boolean {
	return isVoiceConfigured() || isNonohConfigured();
}

export function voiceRecordingsDir(): string {
	return process.env.VOICE_RECORDINGS_DIR?.trim() || "voice-recordings";
}

export function kokoroCacheDir(): string {
	return (
		process.env.KOKORO_TTS_CACHE_DIR?.trim() ||
		".cache/huggingface/hub/models/Kokoro-82M"
	);
}

export function kokoroVoice(): string {
	return process.env.KOKORO_TTS_VOICE?.trim() || "af_heart";
}

export function kokoroSpeed(): number {
	const value = Number.parseFloat(process.env.KOKORO_TTS_SPEED?.trim() ?? "");
	return Number.isNaN(value) ? 1.0 : value;
}

export function recordingPath(callId: string, ext = "wav"): string {
	return `${voiceRecordingsDir()}/${callId}.${ext}`;
}

export function isTerminalStatus(status: CallStatus): boolean {
	return TERMINAL.has(status);
}

export async function callApi<T>(
	path: string,
	options: { method?: string; body?: unknown } = {},
): Promise<T | undefined> {
	const key = voiceApiKey();
	if (!key) throw new Error("VOIPSTUDIO_API_KEY is not configured.");

	const response = await fetch(`${voiceBaseUrl()}${path}`, {
		method: options.method ?? "GET",
		headers: {
			"X-Auth-Token": key,
			...(options.body === undefined
				? {}
				: { "Content-Type": "application/json" }),
		},
		body: options.body === undefined ? undefined : JSON.stringify(options.body),
	});

	if (!response.ok) {
		throw new Error(
			`VoIPStudio responded with HTTP ${response.status} for ${options.method ?? "GET"} ${path}.`,
		);
	}

	const text = await response.text();
	if (text.length === 0) return undefined;

	try {
		return JSON.parse(text) as T;
	} catch {
		return undefined;
	}
}

interface CallResponse {
	data?: { id?: string };
}

export async function makeCall(input: {
	to: string;
	callerId?: string;
	from?: string;
}): Promise<{ id: string }> {
	if (isVoiceConfigured()) {
		const made = await callApi<CallResponse>("/calls", {
			method: "POST",
			body: input.callerId
				? { to: input.to, caller_id: input.callerId }
				: input.from
					? { to: input.to, from: input.from }
					: { to: input.to },
		});
		const id = made?.data?.id;
		if (id) return { id };
	}
	if (isNonohConfigured()) {
		const result = await nonohMakeCall(input.to);
		if (result.ok && result.callId) return { id: result.callId };
	}
	throw new Error("No voice provider configured or call failed.");
}

export async function webcall(input: {
	from: string;
	to: string;
}): Promise<{ id: string }> {
	const made = await callApi<CallResponse>("/webcalls", {
		method: "POST",
		body: { from: input.from, to: input.to },
	});

	const id = made?.data?.id;
	if (!id) throw new Error("VoIPStudio returned no web call id.");
	return { id };
}

export async function getCall(
	sipCallId: string,
): Promise<Record<string, unknown> | undefined> {
	return callApi<Record<string, unknown>>(
		`/calls/${encodeURIComponent(sipCallId)}`,
	);
}

export async function hangup(sipCallId: string): Promise<void> {
	await callApi(`/calls/${encodeURIComponent(sipCallId)}`, {
		method: "DELETE",
	});
}

export async function transfer(
	sipCallId: string,
	destination: string,
): Promise<void> {
	await callApi(`/calls/${encodeURIComponent(sipCallId)}`, {
		method: "PATCH",
		body: { dst: destination },
	});
}

export async function answer(sipCallId: string): Promise<void> {
	await callApi(`/calls/${encodeURIComponent(sipCallId)}`, {
		method: "PATCH",
		body: { state: "answer" },
	});
}

export interface CallCode {
	status: CallStatus;
	codephrase: string;
}

export function callCode(
	status: number | string | null | undefined,
	code: number | null | undefined,
): CallCode {
	const tail = typeof status === "string" ? status.trim() : status;
	const httpStatus =
		typeof tail === "number" || (typeof tail === "string" && /^\d+$/.test(tail))
			? Number(tail)
			: 0;
	const raw = typeof tail === "string" ? tail.toLowerCase() : "";
	if (raw) {
		switch (raw) {
			case "queued":
			case "ringing":
			case "pending":
				return {
					status: CallStatus.RINGING,
					codephrase: "The provider reports the call is queued or ringing.",
				};
			case "in-progress":
			case "in_progress":
			case "answered":
			case "connected":
				return {
					status: CallStatus.IN_PROGRESS,
					codephrase: "The provider reports the call is in progress.",
				};
			case "voicemail":
				return {
					status: CallStatus.IN_PROGRESS,
					codephrase: "The provider reached voicemail.",
				};
			case "completed":
			case "ended":
			case "hangup":
				return {
					status: CallStatus.COMPLETED,
					codephrase: "The provider reports the call completed.",
				};
			case "busy":
				return { status: CallStatus.BUSY, codephrase: "The line was busy." };
			case "no-answer":
			case "no_answer":
			case "noanswer":
				return {
					status: CallStatus.NO_ANSWER,
					codephrase: "The provider reports the call was not answered.",
				};
			case "failed":
			case "error":
				return {
					status: CallStatus.FAILED,
					codephrase: "The provider reported a failure.",
				};
			case "cancelled":
			case "canceled":
				return {
					status: CallStatus.CANCELLED,
					codephrase: "The provider reports the call was cancelled.",
				};
		}
	}

	if (code === 487 || httpStatus === 487) {
		return {
			status: CallStatus.NO_ANSWER,
			codephrase: "The provider reports the call was not answered.",
		};
	}
	if (code === 408 || httpStatus === 408) {
		return {
			status: CallStatus.FAILED,
			codephrase:
				"The provider reports the call timed out before anyone answered.",
		};
	}
	if (httpStatus < 200 && httpStatus > 0) {
		return {
			status: CallStatus.RINGING,
			codephrase: "The line is still ringing; nobody has picked up yet.",
		};
	}
	if (httpStatus === 200) {
		return {
			status: CallStatus.IN_PROGRESS,
			codephrase: "The call is live; whoever answers will hear the pitch.",
		};
	}
	if (httpStatus < 300 && httpStatus > 0) {
		return {
			status: CallStatus.RINGING,
			codephrase: "The provider is forwarding the call.",
		};
	}
	if (httpStatus >= 500) {
		return {
			status: CallStatus.FAILED,
			codephrase:
				"The provider reported a server error; the call could not be completed.",
		};
	}
	return {
		status: CallStatus.FAILED,
		codephrase: "The provider refused the call.",
	};
}

export async function transcribe(
	input: Blob | Buffer,
	_mimeType?: string,
): Promise<string | null> {
	// Use Faster-Whisper standalone CLI (reliable local STT)
	const tempDir =
		process.env.TEMP ||
		process.env.TMP ||
		"C:/Users/PC Principal/AppData/Local/Temp";
	const wavPath = `${tempDir}/crm_stt_${crypto.randomUUID()}.wav`;

	try {
		const fs = await import("node:fs");
		const wavBuffer =
			typeof input === "string"
				? fs.readFileSync(input)
				: input instanceof Buffer
					? input
					: Buffer.from(await (input as Blob).arrayBuffer());
		fs.writeFileSync(wavPath, wavBuffer);

		const fwPath = "F:/Faster-Whisper-XXL/faster-whisper-xxl.exe";
		const ffmpegPath = "F:/Faster-Whisper-XXL/ffmpeg.exe";
		const convertedPath = `${wavPath}.16k.wav`;

		// Convert to 16kHz mono for Faster-Whisper
		const convertProc = spawn(
			ffmpegPath,
			["-i", wavPath, "-ac", "1", "-ar", "16000", "-y", convertedPath],
			{ stdio: ["pipe", "pipe", "pipe"], timeout: 30_000 },
		);

		let converted = wavPath;
		const [convertCode, convertErr] = await new Promise<
			[number | null, string]
		>((resolve) => {
			let err = "";
			convertProc.stderr?.on("data", (d) => (err += d.toString()));
			convertProc.on("close", (c) => resolve([c, err]));
			convertProc.on("error", (e) => resolve([null, e.message]));
		});

		if (convertCode === 0) converted = convertedPath;
		else
			console.log(
				"FW: ffmpeg conversion skipped:",
				convertCode,
				convertErr.slice(0, 80),
			);

		const inputBase = basename(converted, ".wav");
		const outputPath = `${tempDir}/${inputBase}.txt`;
		const proc = spawn(
			fwPath,
			[
				converted,
				"--model",
				"tiny",
				"--model_dir",
				"F:/Faster-Whisper-XXL/_models",
				"--language",
				"en",
				"--output_format",
				"txt",
				"--output_dir",
				tempDir,
				"--verbose",
				"false",
			],
			{ stdio: ["pipe", "pipe", "pipe"], timeout: 120_000 },
		);

		const [exitCode, stderr] = await new Promise<[number | null, string]>(
			(resolve) => {
				let err = "";
				proc.stderr?.on("data", (d) => (err += d.toString()));
				proc.on("close", (c) => resolve([c, err]));
				proc.on("error", (e) => resolve([null, e.message]));
			},
		);

		if (exitCode !== 0) {
			console.log("FW exit:", exitCode, "stderr:", stderr.slice(0, 200));
			return null;
		}

		if (fs.existsSync(outputPath)) {
			const t = fs.readFileSync(outputPath, "utf-8").trim();
			fs.unlinkSync(outputPath);
			return t || null;
		}
		return null;
	} catch (e) {
		console.log("FW transcribe error:", e);
		return null;
	} finally {
		try {
			const fs = await import("node:fs");
			for (const f of [wavPath, `${wavPath}.16k.wav`]) {
				if (fs.existsSync(f)) fs.unlinkSync(f);
			}
		} catch {}
	}
}

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
		`https://api.deepgram.com/v1/listen?model=photon&smart_format=true`,
		{
			method: "POST",
			headers: {
				Authorization: `Token ${apiKey}`,
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

export interface SpeechResult {
	ok: boolean;
	path?: string;
	reason?: string;
}

const WORKER_REQUEST_TIMEOUT_MS = 60_000;

let worker: KokoroWorker | undefined;
let workerStartError: string | undefined;

interface WorkerResponse {
	id?: string | null;
	ok?: boolean;
	path?: string;
	seconds?: number;
	error?: string;
}

interface PendingRequest {
	resolve: (response: WorkerResponse) => void;
	timer: ReturnType<typeof setTimeout>;
}

class KokoroWorker {
	private readonly proc: ChildProcessWithoutNullStreams;
	private readonly pending = new Map<string, PendingRequest>();
	private buffer = "";
	private alive = true;

	constructor(proc: ChildProcessWithoutNullStreams) {
		this.proc = proc;
		proc.stdout.setEncoding("utf8");
		proc.stdout.on("data", (chunk: string) => this.consume(chunk));
		proc.stderr.on("data", () => {});
		proc.on("error", () => this.fail("the kokoro worker process errored."));
		proc.on("exit", () => this.fail("the kokoro worker process exited."));
	}

	get running(): boolean {
		return this.alive;
	}

	request(payload: Record<string, unknown>): Promise<WorkerResponse> {
		if (!this.alive) {
			return Promise.resolve({
				ok: false,
				error: "the kokoro worker is no longer running.",
			});
		}

		const id = crypto.randomUUID();
		return new Promise<WorkerResponse>((resolve) => {
			const timer = setTimeout(() => {
				this.pending.delete(id);
				resolve({
					id,
					ok: false,
					error: `the kokoro worker did not respond within ${WORKER_REQUEST_TIMEOUT_MS} ms.`,
				});
			}, WORKER_REQUEST_TIMEOUT_MS);

			this.pending.set(id, { resolve, timer });
			this.proc.stdin.write(`${JSON.stringify({ ...payload, id })}\n`);
		});
	}

	stop(): void {
		this.fail("the kokoro worker was stopped.");
		if (!this.proc.killed) this.proc.kill();
	}

	private consume(chunk: string): void {
		this.buffer += chunk;
		let index = this.buffer.indexOf("\n");
		while (index >= 0) {
			const line = this.buffer.slice(0, index).trim();
			this.buffer = this.buffer.slice(index + 1);
			index = this.buffer.indexOf("\n");
			if (line.length > 0) this.dispatch(line);
		}
	}

	private dispatch(line: string): void {
		let parsed: WorkerResponse;
		try {
			parsed = JSON.parse(line) as WorkerResponse;
		} catch {
			return;
		}

		const id = typeof parsed.id === "string" ? parsed.id : undefined;
		if (!id) return;

		const pending = this.pending.get(id);
		if (!pending) return;

		this.pending.delete(id);
		clearTimeout(pending.timer);
		pending.resolve(parsed);
	}

	private fail(error: string): void {
		if (!this.alive) return;
		this.alive = false;

		for (const [id, pending] of this.pending) {
			clearTimeout(pending.timer);
			pending.resolve({ id, ok: false, error });
		}
		this.pending.clear();
	}
}

export async function synthesizeSpeech(
	text: string,
	sampleRate?: number,
): Promise<SpeechResult> {
	// Try ElevenLabs first if configured
	if (process.env.ELEVENLABS_API_KEY?.trim()) {
		const result = await synthesizeSpeechElevenLabs(text);
		if (result.ok && result.path) return result;
		if (result.reason) return result; // Don't fall through on intentional failure
	}

	// Fall back to Kokoro
	const scriptPath = kokoroScriptPath();
	const path = recordingPath(crypto.randomUUID(), "wav");
	mkdirSync(voiceRecordingsDir(), { recursive: true });

	const viaWorker = await synthesizeViaWorker({
		text,
		output: path,
		sampleRate,
	});
	if (viaWorker.ok) return { ok: true, path };
	if (viaWorker.startFailure) return { ok: false, reason: viaWorker.reason };

	return await synthesizeOnce(scriptPath, text, path, sampleRate);
}

async function synthesizeSpeechElevenLabs(text: string): Promise<SpeechResult> {
	const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
	if (!apiKey) return { ok: false, reason: "ELEVENLABS_API_KEY not set" };

	const voiceId =
		process.env.ELEVENLABS_VOICE_ID?.trim() || "EXAVITQu4vr4xnSDxMaL";
	const modelId =
		process.env.ELEVENLABS_MODEL_ID?.trim() || "eleven_multilingual_v2";

	const path = recordingPath(crypto.randomUUID(), "wav");
	mkdirSync(voiceRecordingsDir(), { recursive: true });

	try {
		const response = await fetch(
			`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"xi-api-key": apiKey,
				},
				body: JSON.stringify({
					text,
					model_id: modelId,
					output_format: "wav",
					voice_settings: {
						stability: 0.5,
						similarity_boost: 0.75,
					},
				}),
				signal: AbortSignal.timeout(30_000),
			},
		);

		if (!response.ok) {
			const errorText = await response.text();
			return {
				ok: false,
				reason: `ElevenLabs API error ${response.status}: ${errorText.slice(0, 200)}`,
			};
		}

		const arrayBuffer = await response.arrayBuffer();
		const uint8Array = new Uint8Array(arrayBuffer);
		const fs = await import("node:fs");
		fs.writeFileSync(path, uint8Array);
		return { ok: true, path };
	} catch (error) {
		return {
			ok: false,
			reason: error instanceof Error ? error.message : String(error),
		};
	}
}

function kokoroScriptPath(): string {
	return fileURLToPath(new URL("../../scripts/kokoro-tts.py", import.meta.url));
}

function pythonArgs(): string[] {
	return [
		"--voice",
		kokoroVoice(),
		"--speed",
		String(kokoroSpeed()),
		"--cache-dir",
		kokoroCacheDir(),
	];
}

async function synthesizeOnce(
	scriptPath: string,
	text: string,
	path: string,
	sampleRate?: number,
): Promise<SpeechResult> {
	const args = [scriptPath, "--text", text, "--output", path, ...pythonArgs()];
	if (sampleRate !== undefined) {
		args.push("--output-sample-rate", String(sampleRate));
	}

	const proc = spawn("python", args);
	const outcome = await new Promise<{ code: number | null; error?: string }>(
		(resolve) => {
			let settled = false;
			const finish = (value: { code: number | null; error?: string }) => {
				if (settled) return;
				settled = true;
				resolve(value);
			};
			proc.on("error", (error: Error) =>
				finish({ code: null, error: error.message }),
			);
			proc.on("close", (code: number | null) => finish({ code }));
		},
	);

	if (outcome.code === 0) return { ok: true, path };
	return {
		ok: false,
		reason: outcome.error
			? `kokoro-tts could not be started: ${outcome.error}`
			: `kokoro-tts exited with code ${outcome.code}.`,
	};
}

type WorkerOutcome =
	| { ok: true }
	| { ok: false; reason: string; startFailure: boolean };

async function synthesizeViaWorker(input: {
	text: string;
	output: string;
	sampleRate?: number;
}): Promise<WorkerOutcome> {
	const worker = ensureWorker();
	if (!worker) {
		return {
			ok: false,
			reason: workerStartError
				? `kokoro worker could not be started: ${workerStartError}`
				: "kokoro worker could not be started.",
			startFailure: true,
		};
	}

	const response = await worker.request({
		text: input.text,
		output: input.output,
		voice: kokoroVoice(),
		speed: kokoroSpeed(),
		...(input.sampleRate === undefined
			? {}
			: { sample_rate: input.sampleRate }),
	});

	if (response.ok === true) return { ok: true };

	if (workerStartError) {
		return {
			ok: false,
			reason: `kokoro worker could not be started: ${workerStartError}`,
			startFailure: true,
		};
	}
	return {
		ok: false,
		reason: response.error ?? "kokoro worker produced no audio.",
		startFailure: false,
	};
}

function ensureWorker(): KokoroWorker | undefined {
	if (worker?.running) return worker;
	if (workerStartError) return undefined;

	try {
		const proc = spawn(
			"python",
			[kokoroScriptPath(), "--serve", ...pythonArgs()],
			{ stdio: ["pipe", "pipe", "pipe"] },
		);
		const started = new KokoroWorker(proc);
		proc.on("error", (error: Error) => {
			workerStartError = error.message;
		});
		worker = started;
		return started;
	} catch (error) {
		workerStartError = error instanceof Error ? error.message : String(error);
		return undefined;
	}
}

process.on("exit", () => worker?.stop());
