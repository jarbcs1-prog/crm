import { defineTool } from "eve/tools";
import { z } from "zod";
import { encodeWav, readWav } from "../lib/telephony/audio";
import { getSession } from "../lib/telephony/session";

const LEAD_TRIM_MS = 400;
const MAX_LISTEN_MS = 30_000;

function describe(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function round(value: number): number {
	return Math.round(value * 100) / 100;
}

export default defineTool({
	description:
		"Listens on a live call that make_call answered and returns what the other party said. Call it after speak_on_call, once per turn. The first 400 ms of audio is discarded because it is usually our own speech echoed back by the line. A transcript of null means the audio was captured but not understood, never that the caller said nothing.",
	inputSchema: z.object({
		callId: z
			.string()
			.min(1)
			.describe("The CRM call id returned by make_call."),
		maxMs: z
			.number()
			.int()
			.min(1000)
			.max(MAX_LISTEN_MS)
			.optional()
			.describe(
				"How long to keep listening before giving up. Defaults to 8 seconds.",
			),
	}),
	async execute({ callId, maxMs }) {
		const session = getSession(callId);
		if (!session) {
			return {
				heard: false as const,
				seconds: 0,
				reason:
					"There is no live call with that id: it was never answered, or it has already ended.",
			};
		}
		if (session.hasEnded) {
			return {
				heard: false as const,
				seconds: 0,
				reason: "That call has ended, so there is nothing left to hear.",
			};
		}

		let wav: Buffer;
		try {
			wav = await session.listen(maxMs === undefined ? {} : { maxMs });
		} catch (error) {
			return {
				heard: false as const,
				seconds: 0,
				reason: `Listening failed: ${describe(error)}`,
			};
		}

		let pcm: Int16Array;
		let sampleRate: number;
		try {
			const captured = readWav(wav);
			pcm = captured.pcm;
			sampleRate = captured.sampleRate;
		} catch (error) {
			return {
				heard: false as const,
				seconds: 0,
				reason: `The captured audio could not be read: ${describe(error)}`,
			};
		}

		const trim = Math.min(
			pcm.length,
			Math.round((LEAD_TRIM_MS * sampleRate) / 1000),
		);
		const kept = trim > 0 ? pcm.subarray(trim) : pcm;
		const seconds = round(kept.length / sampleRate);

		if (seconds <= 0) {
			return {
				heard: false as const,
				seconds: 0,
				reason:
					"No audio came back from the line in that window, so there is nothing to transcribe.",
			};
		}

		let transcript: string | null = null;
		let reason: string | undefined;

		try {
			const audio = encodeWav(kept, sampleRate);
			transcript = await session.transcribeHeard(audio);
		} catch (error) {
			reason = `The audio was captured but transcription failed (${describe(error)}); treat the caller's words as unknown.`;
		}

		if (reason === undefined && transcript === null) {
			reason =
				"The audio was captured but no transcription came back (FASTER_WHISPER_URL is unset or the whisper server returned nothing); treat the caller's words as unknown.";
		}

		return {
			heard: true as const,
			transcript,
			seconds,
			...(reason === undefined ? {} : { reason }),
		};
	},
});
