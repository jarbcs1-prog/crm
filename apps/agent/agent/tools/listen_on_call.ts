import { defineTool } from "eve/tools";
import { z } from "zod";
import { encodeWav, readWav } from "../lib/telephony/audio";
import { getSession } from "../lib/telephony/session";

const LEAD_TRIM_MS = 400;
const MAX_LISTEN_MS = 30_000;

const branchSchema = z.object({
	id: z.string().min(1),
	trigger: z.array(z.string().min(1)),
	action: z.string().min(1),
	text: z.string().min(1),
});

export type RefusalMatch = {
	branchId: string;
	action: string;
	replyText: string;
	terminate: boolean;
	optOut: boolean;
	clarifyOnce: boolean;
};

const CONTRACTIONS: Array<[RegExp, string]> = [
	[/\bdon't\b/g, "do not"],
	[/\bcan't\b/g, "can not"],
	[/\bwon't\b/g, "will not"],
	[/\bshan't\b/g, "shall not"],
	[/\bain't\b/g, "am not"],
	[/\bn't\b/g, " not"],
	[/\bi'm\b/g, "i am"],
	[/\byou're\b/g, "you are"],
	[/\bwe're\b/g, "we are"],
	[/\bthey're\b/g, "they are"],
	[/\bthat's\b/g, "that is"],
	[/\bit's\b/g, "it is"],
	[/\bwhat's\b/g, "what is"],
	[/\bthere's\b/g, "there is"],
	[/\bi've\b/g, "i have"],
	[/\bi'll\b/g, "i will"],
	[/\byou'll\b/g, "you will"],
];

function normalize(value: string): string {
	let text = value.toLowerCase().replace(/\{[^{}\n]{1,64}\}/g, " ");
	for (const [pattern, replacement] of CONTRACTIONS) {
		text = text.replace(pattern, replacement);
	}
	return text
		.replace(/[^a-z0-9\s]/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function tokensOf(value: string): string[] {
	const text = normalize(value);
	return text.length === 0 ? [] : text.split(" ");
}

function containsSequence(haystack: string[], needle: string[]): boolean {
	if (needle.length === 0 || needle.length > haystack.length) {
		return false;
	}
	for (let start = 0; start <= haystack.length - needle.length; start++) {
		let hit = true;
		for (let i = 0; i < needle.length; i++) {
			if (haystack[start + i] !== needle[i]) {
				hit = false;
				break;
			}
		}
		if (hit) {
			return true;
		}
	}
	return false;
}

export function matchBranch(
	transcript: string,
	branches: Array<{ id: string; trigger: string[]; action: string; text: string }>,
): RefusalMatch | null {
	const heard = tokensOf(transcript);
	if (heard.length === 0) {
		return null;
	}
	for (const branch of branches) {
		for (const phrase of branch.trigger) {
			const needle = tokensOf(phrase);
			if (containsSequence(heard, needle)) {
				return {
					branchId: branch.id,
					action: branch.action,
					replyText: branch.text,
					terminate: branch.action.startsWith("TERMINATE"),
					optOut: branch.action === "TERMINATE_AND_OPTOUT",
					clarifyOnce: branch.action === "CLARIFY_ONCE",
				};
			}
		}
	}
	return null;
}

function describe(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function round(value: number): number {
	return Math.round(value * 100) / 100;
}

export default defineTool({
	description:
		"Listens on a live call that make_call answered and returns what the other party said. Call it after speak_on_call, once per turn. The first 400 ms of audio is discarded because it is usually our own speech echoed back by the line. A transcript of null means the audio was captured but not understood, never that the caller said nothing. When refusal branches from load_pitch are passed, the transcript is matched against their triggers and a match tells you exactly which reply to speak and whether to end the call: TERMINATE actions end the call, TERMINATE_AND_OPTOUT also records a do-not-contact. Silence, ambiguity and recognition of names are never consent: only an explicit affirmative moves the conversation toward document requests.",
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
		branches: z
			.array(branchSchema)
			.optional()
			.describe(
				"The refusal_branches array returned by load_pitch for this pitch. When supplied, the transcript is matched against each branch trigger and a match is returned with the reply to speak and the action to honor.",
			),
		consentRules: z
			.record(z.string(), z.boolean())
			.optional()
			.describe(
				"The consentRules object returned by load_pitch for this pitch. Returned back for reference; matching never reports consent from silence, ambiguity, recognition or the mere fact the call was answered.",
			),
	}),
	async execute({ callId, maxMs, branches, consentRules }) {
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
			...(transcript === null || branches === undefined || branches.length === 0
				? {
					consent: "unknown" as const,
					guidance:
						"No refusal determination was made: treat the caller's words as unknown and never as consent to request or transfer documents. Agreement to hear the explanation is not consent to provide documents.",
				}
				: (() => {
					const match = matchBranch(transcript, branches);
					if (match === null) {
						return {
							consent: "unknown" as const,
							guidance:
								"No refusal trigger matched: continue with the next pitch segment. This is not consent to request documents; document requests require a separate explicit affirmative.",
						};
					}
					return {
						consent: match.terminate ? ("refused" as const) : ("unknown" as const),
						match,
						guidance: match.terminate
							? `Speak the matched reply verbatim, then end the call${match.optOut ? " and record a do-not-contact" : ""}. Do not persuade, schedule, or collect anything further.`
							: match.clarifyOnce
								? "First brush-off: speak the matched diagnostic question verbatim, exactly once. Record that clarification was used: any further negative, silence, irritation or deflection after it ends the call with no third attempt. Do-not-contact language at any point bypasses clarification and ends the call immediately."
								: "Verification concern or deferral: speak the matched reply verbatim, provide only approved verification information, and do not request documents on this turn.",
					};
				})()),
			...(consentRules === undefined ? {} : { consentRules }),
		};
	},
});
