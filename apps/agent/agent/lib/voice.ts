import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { CallStatus } from "@crm/db";
import { nonohConfigured, nonohHangup, nonohMakeCall } from "./nonoh-sip";

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
		"F:\\.cache\\huggingface\\hub\\models\\Kokoro-82M\\snapshots\\f3ff3571791e39611d31c381e3a41a3af07b4987"
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

export async function transcribe(input: {
	data: Blob;
	mime: string;
}): Promise<string | null> {
	const endpoint = process.env.FASTER_WHISPER_URL?.trim();
	if (!endpoint) return null;

	const form = new FormData();
	const ext = input.mime.includes("wav") ? "wav" : "webm";
	form.append("file", input.data, `recording.${ext}`);
	form.append("response_format", "json");

	const response = await fetch(
		`${endpoint.replace(/\/+$/, "")}/v1/audio/transcriptions`,
		{
			method: "POST",
			body: form,
		},
	);

	if (!response.ok) return null;

	const text = await response.text();
	try {
		const parsed = JSON.parse(text) as { text?: unknown };
		return typeof parsed.text === "string" && parsed.text.length > 0
			? parsed.text
			: null;
	} catch {
		return null;
	}
}

export interface SpeechResult {
	ok: boolean;
	path?: string;
	reason?: string;
}

export async function synthesizeSpeech(text: string): Promise<SpeechResult> {
	const scriptPath = fileURLToPath(
		new URL("../scripts/kokoro-tts.py", import.meta.url),
	);
	const path = recordingPath(crypto.randomUUID(), "wav");
	mkdirSync(voiceRecordingsDir(), { recursive: true });

	const proc = spawn("python", [
		scriptPath,
		"--text",
		text,
		"--output",
		path,
		"--voice",
		kokoroVoice(),
		"--speed",
		String(kokoroSpeed()),
		"--cache-dir",
		kokoroCacheDir(),
	]);
	const exitCode = await new Promise<number>((resolve) =>
		proc.on("close", resolve),
	);

	if (exitCode !== 0) {
		return { ok: false, reason: `kokoro-tts exited with code ${exitCode}.` };
	}
	return { ok: true, path };
}
