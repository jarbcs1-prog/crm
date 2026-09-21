import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineTool } from "eve/tools";
import { z } from "zod";

const PITCHES_DIR = fileURLToPath(new URL("../pitches", import.meta.url));
const DEFAULT_LISTEN_MS = 8000;
const MIN_LISTEN_MS = 1000;
const MAX_LISTEN_MS = 30_000;
const PLACEHOLDER = /\{[^{}\n]{1,64}\}/g;

type ListedPitch = {
	id: string;
	name: string;
	segmentCount: number;
};

type PitchSegment = {
	id: string;
	text: string;
	listenAfter: boolean;
	listenMs: number;
};

type PitchFile = {
	stem: string;
	parsed: unknown;
	readError?: string;
};

function describe(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;
}

function clampListenMs(value: unknown): number {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		return DEFAULT_LISTEN_MS;
	}
	return Math.min(MAX_LISTEN_MS, Math.max(MIN_LISTEN_MS, Math.round(value)));
}

async function readPitchFiles(): Promise<PitchFile[]> {
	let names: string[];
	try {
		names = await readdir(PITCHES_DIR);
	} catch (error) {
		throw new Error(`The pitches directory could not be read: ${describe(error)}`);
	}

	const files = names
		.filter((name) => name.toLowerCase().endsWith(".json"))
		.sort();

	return Promise.all(
		files.map(async (name) => {
			const stem = name.slice(0, -".json".length);
			try {
				const raw = await readFile(join(PITCHES_DIR, name), "utf8");
				return { stem, parsed: JSON.parse(raw) as unknown };
			} catch (error) {
				return { stem, parsed: undefined, readError: describe(error) };
			}
		}),
	);
}

function listPitches(files: PitchFile[]): ListedPitch[] {
	return files.map((file) => {
		const record = asRecord(file.parsed);
		const id = record && typeof record.id === "string" && record.id.length > 0
			? record.id
			: file.stem;
		const name = record && typeof record.name === "string" && record.name.length > 0
			? record.name
			: file.stem;
		const segments = record?.segments;
		return {
			id,
			name,
			segmentCount: Array.isArray(segments) ? segments.length : 0,
		};
	});
}

function variablesOf(record: Record<string, unknown>): string[] {
	const variables = record.variables;
	if (!Array.isArray(variables)) {
		return ["firstName"];
	}
	const names = variables.filter(
		(value): value is string => typeof value === "string" && value.length > 0,
	);
	return names.includes("firstName") ? names : ["firstName", ...names];
}

function substitute(text: string, variables: string[], firstName: string): string {
	let out = text;
	for (const variable of variables) {
		out = out.split(`{${variable}}`).join(variable === "firstName" ? firstName : "");
	}
	return out.replace(PLACEHOLDER, "");
}

export default defineTool({
	description:
		"Loads a stored call pitch so it does not have to be pasted into the prompt. Call it with no pitchId to list the available pitches. With a pitchId it returns the segments in order, each with the listenMs to hand to listen_on_call, with {firstName} placeholders already filled in from the contact's real first name. Never throws: an unknown id returns the list of pitches instead and a broken file comes back with a reason.",
	inputSchema: z.object({
		pitchId: z
			.string()
			.min(1)
			.optional()
			.describe(
				"The pitch to load, as returned in the pitch list. Omit it to list what is available.",
			),
		firstName: z
			.string()
			.optional()
			.describe(
				"The contact's real first name, used for {firstName} in the pitch text. Omit it only when the name is unknown.",
			),
	}),
	async execute({ pitchId, firstName }) {
		let files: PitchFile[];
		try {
			files = await readPitchFiles();
		} catch (error) {
			return {
				pitches: [] as ListedPitch[],
				reason: describe(error),
			};
		}

		const pitches = listPitches(files);
		if (pitchId === undefined) {
			return { pitches };
		}

		const match =
			files.find((file) => file.stem === pitchId) ??
			files.find((file) => {
				const record = asRecord(file.parsed);
				return record?.id === pitchId;
			});

		if (match === undefined) {
			return {
				pitches,
				note: `No pitch matched "${pitchId}"; these are the pitches that exist.`,
			};
		}

		if (match.readError !== undefined) {
			return {
				pitchId,
				reason: `The pitch file "${match.stem}.json" could not be read: ${match.readError}`,
				pitches,
			};
		}

		const record = asRecord(match.parsed);
		if (record === undefined) {
			return {
				pitchId,
				reason: `The pitch file "${match.stem}.json" is not a JSON object, so it has no segments to speak.`,
				pitches,
			};
		}

		const name = typeof record.name === "string" && record.name.length > 0
			? record.name
			: match.stem;

		if (!Array.isArray(record.segments)) {
			return {
				pitchId,
				name,
				reason: `The pitch "${name}" has no "segments" array, so there is nothing to speak.`,
				pitches,
			};
		}
		if (record.segments.length === 0) {
			return {
				pitchId,
				name,
				reason: `The pitch "${name}" has no segments, so there is nothing to speak.`,
				pitches,
			};
		}

		const variables = variablesOf(record);
		const given = firstName?.trim() ?? "";
		const segments: PitchSegment[] = [];
		let missingName = false;
		let clearedOther = false;

		for (const [index, entry] of record.segments.entries()) {
			const segment = asRecord(entry);
			const id =
				segment && typeof segment.id === "string" && segment.id.length > 0
					? segment.id
					: `s${index + 1}`;
			if (segment === undefined || typeof segment.text !== "string" || segment.text.trim().length === 0) {
				return {
					pitchId,
					name,
					reason: `Segment ${index + 1} ("${id}") of the pitch "${name}" has no "text" string, so the pitch cannot be spoken.`,
					pitches,
				};
			}
			for (const variable of variables) {
				if (!segment.text.includes(`{${variable}}`)) {
					continue;
				}
				if (variable === "firstName") {
					if (given.length === 0) {
						missingName = true;
					}
				} else {
					clearedOther = true;
				}
			}

			segments.push({
				id,
				text: substitute(segment.text, variables, given),
				listenAfter: typeof segment.listenAfter === "boolean" ? segment.listenAfter : true,
				listenMs: clampListenMs(segment.listenMs),
			});
		}

		const note = missingName
			? clearedOther
				? "No first name was supplied, so {firstName} was replaced with an empty string and the other placeholders were cleared too because no value was given for them. Never read a placeholder aloud: leave the name out of the sentence instead."
				: "No first name was supplied, so {firstName} was replaced with an empty string. Never read a placeholder aloud: leave the name out of the sentence instead."
			: clearedOther
				? "Placeholders other than {firstName} were cleared because no value was supplied for them."
				: undefined;

		return {
			pitchId: typeof record.id === "string" && record.id.length > 0 ? record.id : match.stem,
			name,
			segmentCount: segments.length,
			segments,
			...(note === undefined ? {} : { note }),
		};
	},
});
