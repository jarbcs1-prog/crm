import { readFile, writeFile } from "node:fs/promises";
import { synthesizeSpeech, transcribe } from "../voice";
import { encodeWav, pcmToUlaw, readWav, rms } from "./audio";
import { spawn } from "node:child_process";
import { RtpSession, type RtpStats } from "./rtp";
import { SipClient, type SipDialog } from "./sip-client";

const SAMPLE_RATE = 8000;
const SAMPLES_PER_MS = SAMPLE_RATE / 1000;
const SILENCE_RMS = 250;
const DEFAULT_MAX_MS = 8000;
const DEFAULT_SILENCE_MS = 1200;
const DEFAULT_MIN_SPEECH_MS = 400;
const RECORDING_SAMPLES = SAMPLE_RATE * 30;

const sessions = new Map<string, CallSession>();

export type CallSessionStats = RtpStats;

export interface DialResult {
	ok: boolean;
	status?: number;
	session?: CallSession;
	reason?: string;
}

export interface SpeakResult {
	ok: boolean;
	reason?: string;
}

export interface ListenOptions {
	maxMs?: number;
	silenceMs?: number;
	minSpeechMs?: number;
}

export interface DialOptions {
	key?: string;
}

interface CallParts {
	sipCallId: string;
	client: SipClient;
	rtp: RtpSession;
	dialog?: SipDialog;
}

export class CallSession {
	readonly sipCallId: string;

	private readonly client: SipClient;
	private readonly rtp: RtpSession;
	private readonly dialog: SipDialog | undefined;

	private readonly aliases = new Set<string>();
	private frames: Int16Array[] = [];
	private frameSamples = 0;
	private collector: ((pcm: Int16Array) => void) | undefined;
	private ended = false;

	private constructor(parts: CallParts) {
		this.sipCallId = parts.sipCallId;
		this.client = parts.client;
		this.rtp = parts.rtp;
		this.dialog = parts.dialog;
		this.rtp.onInbound((pcm) => this.retain(pcm));
	}

	static async dial(
		toNumber: string,
		options: DialOptions = {},
	): Promise<DialResult> {
		let client: SipClient | undefined;
		let rtp: RtpSession | undefined;

		try {
			client = await SipClient.create();

			if (!client.isRegistered) {
				const registered = await client.register();
				if (!registered.ok) {
					client.close();
					return {
						ok: false,
						reason: registered.reason ?? "SIP registration failed.",
					};
				}
			}

			try {
				rtp = await RtpSession.open();
			} catch (error) {
				client.close();
				return {
					ok: false,
					reason: `Could not open an RTP socket: ${describe(error)}`,
				};
			}

			const invite = await client.invite(toNumber, rtp.publicAddress);

			if (invite.status !== 200 || !invite.ok) {
				const reason =
					invite.reason ??
					(invite.status === undefined
						? "The call was not answered (no final response)."
						: `The call was not answered (SIP ${invite.status}).`);

				rtp.close();
				if (invite.dialog) await client.bye(invite.dialog);
				client.close();
				return { ok: false, status: invite.status, reason };
			}

			if (!invite.remoteMedia) {
				rtp.close();
				if (invite.dialog) await client.bye(invite.dialog);
				client.close();
				return {
					ok: false,
					reason:
						"The call was answered (200 OK) but the answer carried no RTP media address, so no audio can flow.",
				};
			}

			if (invite.dialog) await client.ack(invite.dialog);
			rtp.start(invite.remoteMedia);

			const sipCallId = invite.sipCallId ?? `local-${Date.now().toString(16)}`;
			const session = new CallSession({
				sipCallId,
				client,
				rtp,
				dialog: invite.dialog,
			});

			sessions.set(sipCallId, session);
			if (options.key && options.key !== sipCallId) {
				sessions.set(options.key, session);
				session.aliases.add(options.key);
			}

			return { ok: true, session };
		} catch (error) {
			rtp?.close();
			client?.close();
			return {
				ok: false,
				reason: `Could not place the call: ${describe(error)}`,
			};
		}
	}

	get stats(): CallSessionStats {
		return this.rtp.stats;
	}

	get hasEnded(): boolean {
		return this.ended;
	}

	async speak(text: string): Promise<SpeakResult> {
		if (this.ended) return { ok: false, reason: "The call has ended." };

		const speech = await synthesizeSpeech(text, SAMPLE_RATE);
		if (!speech.ok || !speech.path) {
			return {
				ok: false,
				reason: speech.reason ?? "Speech synthesis produced no audio.",
			};
		}

		// ElevenLabs may return MP3 despite requesting WAV - convert if needed
		let wavBuffer = await readFile(speech.path);
		if (!isWav(wavBuffer)) {
			wavBuffer = await convertMp3ToWav(speech.path);
			if (!wavBuffer) {
				return { ok: false, reason: "Failed to convert TTS audio to WAV" };
			}
		}

		try {
			this.rtp.enqueue(pcmToUlaw(readWav(wavBuffer).pcm));
			await this.rtp.drain();
			return { ok: true };
		} catch (error) {
			return {
				ok: false,
				reason: `Could not play the synthesized audio: ${describe(error)}`,
			};
		}
	}

	async listen(options: ListenOptions = {}): Promise<Buffer> {
		const maxMs = options.maxMs ?? DEFAULT_MAX_MS;
		const silenceMs = options.silenceMs ?? DEFAULT_SILENCE_MS;
		const minSpeechMs = options.minSpeechMs ?? DEFAULT_MIN_SPEECH_MS;

		if (this.ended) return encodeWav(new Int16Array(0), SAMPLE_RATE);

		return await new Promise<Buffer>((resolve) => {
			const chunks: Int16Array[] = [];
			let heardSamples = 0;
			let quietMs = 0;
			let done = false;
			let timer: ReturnType<typeof setTimeout> | undefined;

			const finish = () => {
				if (done) return;
				done = true;
				if (timer !== undefined) clearTimeout(timer);
				this.collector = undefined;
				resolve(encodeWav(flatten(chunks, heardSamples), SAMPLE_RATE));
			};

			this.collector = (pcm) => {
				chunks.push(pcm);
				heardSamples += pcm.length;

				const frameMs = pcm.length / SAMPLES_PER_MS;
				quietMs = rms(pcm) >= SILENCE_RMS ? 0 : quietMs + frameMs;

				const heardMs = heardSamples / SAMPLES_PER_MS;
				if (heardMs >= minSpeechMs && quietMs >= silenceMs) finish();
				else if (heardMs >= maxMs) finish();
			};

			timer = setTimeout(finish, maxMs);
			timer.unref?.();
		});
	}

	async transcribeHeard(wav: Buffer): Promise<string | null> {
			// Use Faster-Whisper locally (DeepGram has permission issues)
			return await transcribe(wav, "audio/wav");
		}

	recording(): Buffer {
		return encodeWav(flatten(this.frames, this.frameSamples), SAMPLE_RATE);
	}

	async hangup(): Promise<void> {
		if (this.ended) return;
		this.ended = true;
		sessions.delete(this.sipCallId);
		for (const alias of this.aliases) sessions.delete(alias);
		this.aliases.clear();

		try {
			if (this.dialog) await this.client.bye(this.dialog);
		} catch {
			return;
		} finally {
			this.rtp.close();
			this.client.close();
		}
	}

	private retain(pcm: Int16Array): void {
		if (pcm.length === 0) return;

		this.frames.push(pcm);
		this.frameSamples += pcm.length;

		while (this.frameSamples > RECORDING_SAMPLES && this.frames.length > 1) {
			const dropped = this.frames.shift();
			this.frameSamples -= dropped?.length ?? 0;
		}

		this.collector?.(pcm);
	}
}

export function getSession(id: string): CallSession | undefined {
	return sessions.get(id);
}

export function allSessions(): CallSession[] {
	return [...sessions.values()];
}

function flatten(chunks: Int16Array[], total: number): Int16Array {
	const out = new Int16Array(total);
	let at = 0;

	for (const chunk of chunks) {
		out.set(chunk, at);
		at += chunk.length;
	}

	return out;
}

function describe(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function isWav(buf: Buffer): boolean {
	return (
		buf.length >= 12 &&
		buf.toString("ascii", 0, 4) === "RIFF" &&
		buf.toString("ascii", 8, 12) === "WAVE"
	);
}

async function convertMp3ToWav(inputPath: string): Promise<Buffer | null> {
	try {
		const outputPath = inputPath + ".converted.wav";
		const ffmpegPath =
			"C:/Users/PC Principal/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-9.0.1-full_build/bin/ffmpeg.exe";
		const proc = spawn(ffmpegPath, [
			"-i",
			inputPath,
			"-acodec",
			"pcm_s16le",
			"-ar",
			"8000",
			"-ac",
			"1",
			"-y",
			outputPath,
		], { stdio: ["pipe", "pipe", "pipe"] });

		const [code, stderr] = await new Promise<[number | null, string]>((resolve) => {
			let err = "";
			proc.stderr?.on("data", (d) => (err += d.toString()));
			proc.on("close", (code) => resolve([code, err]));
		});

		if (code !== 0) {
			console.error("ffmpeg conversion failed:", stderr.slice(0, 200));
			return null;
		}

		return await readFile(outputPath);
	} catch (e) {
		console.error("ffmpeg conversion error:", e);
		return null;
	}
}
