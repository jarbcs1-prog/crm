import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { defineTool } from "../lib/tool-factory";

const PITCHES_DIR = fileURLToPath(new URL("../../data/pitches", import.meta.url));
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

type RefusalBranch = {
	id: string;
	trigger: string[];
	action: string;
	text: string;
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
		throw new Error(
			`The pitches directory could not be read: ${describe(error)}`,
		);
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
		const id =
			record && typeof record.id === "string" && record.id.length > 0
				? record.id
				: file.stem;
		const name =
			record && typeof record.name === "string" && record.name.length > 0
				? record.name
				: file.stem;
		const segments = record?.segments;
		const conversation = record?.conversation;
		return {
			id,
			name,
			segmentCount: Array.isArray(segments)
				? segments.length
				: Array.isArray(conversation)
					? conversation.length
					: 0,
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

function substitute(
	text: string,
	variables: string[],
	firstName: string,
	values?: Record<string, string>,
): { text: string; missing: string[] } {
	let out = text;
	for (const variable of variables) {
		out = out
			.split(`{${variable}}`)
			.join(variable === "firstName" ? firstName : "");
	}
	if (values) {
		for (const [key, value] of Object.entries(values)) {
			out = out.split(`{${key}}`).join(value);
		}
	}
	const missing: string[] = [];
	for (const match of out.matchAll(PLACEHOLDER)) {
		const key = match[0].slice(1, -1);
		if (key !== "firstName" && !missing.includes(key)) {
			missing.push(key);
		}
	}
	return { text: out, missing };
}

function entriesOf(value: unknown): Array<[string, string]> {
	const record = asRecord(value);
	if (record === undefined) {
		return [];
	}
	return Object.entries(record).filter(
		(entry): entry is [string, string] =>
			typeof entry[1] === "string" && entry[1].length > 0,
	);
}

function refusalBranchesOf(
	record: Record<string, unknown>,
): RefusalBranch[] | undefined {
	const branches = record.refusal_branches;
	if (!Array.isArray(branches)) {
		return undefined;
	}
	return branches.flatMap((entry) => {
		const branch = asRecord(entry);
		if (
			branch === undefined ||
			typeof branch.id !== "string" ||
			branch.id.length === 0 ||
			!Array.isArray(branch.trigger) ||
			typeof branch.action !== "string" ||
			typeof branch.text !== "string" ||
			branch.text.trim().length === 0
		) {
			return [];
		}
		return [
			{
				id: branch.id,
				trigger: branch.trigger.filter(
					(value): value is string =>
						typeof value === "string" && value.length > 0,
				),
				action: branch.action,
				text: branch.text,
			},
		];
	});
}

function passthroughOf(record: Record<string, unknown>, key: string): unknown {
	const value = record[key];
	return value === undefined ? undefined : value;
}

export default defineTool({
	description:
		"Loads a stored call pitch so it does not have to be pasted into the prompt. Call it with no pitchId to list the available pitches. With a pitchId it returns the segments in order, each with the listenMs to hand to listen_on_call, with {firstName} placeholders already filled in from the contact's real first name. Versioned schemas are supported: legacy pitches expose segments[], policy pitches (scam-recovery-v2.1 shape) expose conversation[] plus refusal_branches, consent_rules, states and policy, with deployment placeholders filled from values. Never throws: an unknown id returns the list of pitches instead and a broken file comes back with a reason.",
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
		values: z
			.record(z.string(), z.string())
			.optional()
			.describe(
				"Deployment values for pitch placeholders such as principal_name, verified_callback_number, verification_url, case_reference, principal_role, approved_case_description, approved_case_development and approved_source_description. Omitted keys are reported in missing instead of being cleared.",
			),
	}),
	async execute({ pitchId, firstName, values }) {
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

		const name =
			typeof record.name === "string" && record.name.length > 0
				? record.name
				: match.stem;

		const rawSegments = Array.isArray(record.segments)
			? { kind: "segments" as const, entries: record.segments }
			: Array.isArray(record.conversation)
				? { kind: "conversation" as const, entries: record.conversation }
				: undefined;
		if (rawSegments === undefined) {
			return {
				pitchId,
				name,
				reason: `The pitch "${name}" has neither a "segments" array nor a "conversation" array, so there is nothing to speak.`,
				pitches,
			};
		}
		if (rawSegments.entries.length === 0) {
			return {
				pitchId,
				name,
				reason: `The pitch "${name}" has no segments, so there is nothing to speak.`,
				pitches,
			};
		}

		const variables = variablesOf(record);
		const given = firstName?.trim() ?? "";
		const supplied =
			values !== undefined ? Object.fromEntries(entriesOf(values)) : undefined;
		const segments: PitchSegment[] = [];
		let missingName = false;
		let clearedOther = false;
		const missingRuntime: string[] = [];

		for (const [index, entry] of rawSegments.entries.entries()) {
			const segment = asRecord(entry);
			const id =
				segment && typeof segment.id === "string" && segment.id.length > 0
					? segment.id
					: `s${index + 1}`;
			if (
				segment === undefined ||
				typeof segment.text !== "string" ||
				segment.text.trim().length === 0
			) {
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

			const substituted =
				rawSegments.kind === "segments"
					? {
							text: substitute(segment.text, variables, given).text.replace(
								PLACEHOLDER,
								"",
							),
							missing: [] as string[],
						}
					: substitute(segment.text, variables, given, supplied);
			for (const key of substituted.missing) {
				if (!missingRuntime.includes(key)) {
					missingRuntime.push(key);
				}
			}
			segments.push({
				id,
				text: substituted.text,
				listenAfter:
					typeof segment.listenAfter === "boolean" ? segment.listenAfter : true,
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

		if (rawSegments.kind === "conversation") {
			const rawBranches = refusalBranchesOf(record);
			const resolvedBranches = rawBranches?.map((branch) => {
				const resolved = substitute(branch.text, variables, given, supplied);
				for (const key of resolved.missing) {
					if (key !== "firstName" && !missingRuntime.includes(key)) {
						missingRuntime.push(key);
					}
				}
				return { ...branch, text: resolved.text };
			});
			const missing = missingRuntime.filter((key) => key !== "firstName");
			return {
				pitchId:
					typeof record.id === "string" && record.id.length > 0
						? record.id
						: match.stem,
				name,
				schema: "conversation",
				segmentCount: segments.length,
				segments,
				...(resolvedBranches === undefined
					? {}
					: { refusalBranches: resolvedBranches }),
				...(record.consent_rules === undefined
					? {}
					: { consentRules: passthroughOf(record, "consent_rules") }),
				...(record.states === undefined
					? {}
					: { states: passthroughOf(record, "states") }),
				...(record.policy === undefined
					? {}
					: { policy: passthroughOf(record, "policy") }),
				...(missing.length === 0
					? {}
					: {
							missing,
							missingNote:
								"These placeholders have no deployment value yet. Do not read them aloud and do not invent values: ask for verification details or leave the sentence out until values are configured.",
						}),
				...(note === undefined ? {} : { note }),
			};
		}

		return {
			pitchId:
				typeof record.id === "string" && record.id.length > 0
					? record.id
					: match.stem,
			name,
			schema: "segments",
			segmentCount: segments.length,
			segments,
			...(note === undefined ? {} : { note }),
		};
	},
});
