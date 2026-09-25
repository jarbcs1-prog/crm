import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
	requestsDocuments,
	runSimulation,
	type SimBranch,
	type SimPersona,
	type SimScores,
	type SimSegment,
	scoreSimulation,
	transcriptExcerpt,
} from "./call-sim";

const DATA_DIR = fileURLToPath(new URL("../../data", import.meta.url));
export const PROPOSALS_DIR = join(DATA_DIR, "pitch-proposals");

export type FailedEval = {
	personaId: string;
	personaLabel: string;
	targetScore: number;
	scores: SimScores;
	excerpt: string;
};

export type PatchOp = {
	op: "add-clarify-beat" | "add-closing-line" | "add-consent-gate" | "tighten-segment";
	segmentId?: string;
	afterSegmentId?: string;
	text: string;
	rationale: string;
};

export type CritiqueRound = {
	pass: boolean;
	feedback: string;
	droppedIndexes: number[];
};

export type PitchPatchProposal = {
	status: "DRAFT";
	pitch: string;
	createdAt: string;
	corpusHash: string;
	targetScore: number;
	evalScores: Array<{
		personaId: string;
		taskCompletion: number;
		efficiency: number;
		complianceFailed: string[];
	}>;
	patches: PatchOp[];
	writerNotes: string;
	critique: CritiqueRound[];
	applyNote: string;
};

function describe(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;
}

export function hashCorpus(parts: string[]): string {
	return createHash("sha256").update(parts.join("\n")).digest("hex");
}

export async function loadSimPitch(
	pitchId: string,
): Promise<
	| { ok: true; stem: string; raw: string; segments: SimSegment[]; branches: SimBranch[] }
	| { ok: false; reason: string }
> {
	let stems: string[];
	try {
		const { readdir } = await import("node:fs/promises");
		stems = (await readdir(join(DATA_DIR, "pitches")))
			.filter((name) => name.toLowerCase().endsWith(".json"))
			.map((name) => name.slice(0, -".json".length))
			.sort();
	} catch (error) {
		return { ok: false, reason: `The pitches directory could not be read: ${describe(error)}` };
	}
	let stem = stems.find((entry) => entry === pitchId);
	if (stem === undefined) {
		for (const entry of stems) {
			try {
				const raw = await readFile(join(DATA_DIR, "pitches", `${entry}.json`), "utf8");
				if (asRecord(JSON.parse(raw))?.id === pitchId) {
					stem = entry;
					break;
				}
			} catch {
			}
		}
	}
	if (stem === undefined) {
		return { ok: false, reason: `No pitch matched "${pitchId}".` };
	}
	let raw: string;
	try {
		raw = await readFile(join(DATA_DIR, "pitches", `${stem}.json`), "utf8");
	} catch (error) {
		return { ok: false, reason: `The pitch file "${stem}.json" could not be read: ${describe(error)}` };
	}
	const record = asRecord(JSON.parse(raw) as unknown);
	if (record === undefined) {
		return { ok: false, reason: `The pitch file "${stem}.json" is not a JSON object.` };
	}
	const entries = Array.isArray(record.segments)
		? record.segments
		: Array.isArray(record.conversation)
			? record.conversation
			: undefined;
	if (!Array.isArray(entries) || entries.length === 0) {
		return { ok: false, reason: `The pitch "${stem}" has no segments or conversation array.` };
	}
	const segments: SimSegment[] = [];
	for (const [index, entry] of entries.entries()) {
		const segment = asRecord(entry);
		if (segment === undefined || typeof segment.text !== "string" || segment.text.trim().length === 0) {
			return { ok: false, reason: `Segment ${index + 1} of the pitch "${stem}" has no text.` };
		}
		segments.push({
			id: typeof segment.id === "string" && segment.id.length > 0 ? segment.id : `s${index + 1}`,
			text: segment.text,
			listenAfter: typeof segment.listenAfter === "boolean" ? segment.listenAfter : true,
		});
	}
	const branches: SimBranch[] = Array.isArray(record.refusal_branches)
		? record.refusal_branches.flatMap((entry) => {
				const branch = asRecord(entry);
				if (
					branch === undefined ||
					typeof branch.id !== "string" ||
					typeof branch.action !== "string" ||
					typeof branch.text !== "string" ||
					!Array.isArray(branch.trigger)
				) {
					return [];
				}
				return [
					{
						id: branch.id,
						trigger: branch.trigger.filter(
							(value): value is string => typeof value === "string" && value.length > 0,
						),
						action: branch.action,
						text: branch.text,
					},
				];
			})
		: [];
	return { ok: true, stem, raw, segments, branches };
}

export async function loadPersonas(): Promise<
	| { ok: true; raw: string; personas: SimPersona[] }
	| { ok: false; reason: string }
> {
	let raw: string;
	try {
		raw = await readFile(join(DATA_DIR, "call-personas.json"), "utf8");
	} catch (error) {
		return { ok: false, reason: `The persona fixtures could not be read: ${describe(error)}` };
	}
	const parsed = JSON.parse(raw) as unknown;
	if (!Array.isArray(parsed)) {
		return { ok: false, reason: "The persona fixtures file is not an array." };
	}
	const personas: SimPersona[] = [];
	for (const entry of parsed) {
		const record = asRecord(entry);
		if (
			record === undefined ||
			typeof record.id !== "string" ||
			typeof record.label !== "string" ||
			typeof record.objective !== "string" ||
			!Array.isArray(record.script) ||
			typeof record.defaultReply !== "string"
		) {
			return { ok: false, reason: "A persona fixture is missing id, label, objective, script or defaultReply." };
		}
		personas.push({
			id: record.id,
			label: record.label,
			objective: record.objective,
			script: record.script.filter((line): line is string => typeof line === "string"),
			defaultReply: record.defaultReply,
		});
	}
	return { ok: true, raw, personas };
}

export function evaluatePitch(
	segments: SimSegment[],
	branches: SimBranch[],
	personas: SimPersona[],
	_targetScore: number,
): Array<{ persona: SimPersona; scores: SimScores; excerpt: string }> {
	return personas.map((persona) => {
		const result = runSimulation(segments, branches, persona);
		const action = branches.find((branch) => branch.id === result.terminalBranchId)?.action;
		const scores = scoreSimulation(result, segments.length, action);
		return { persona, scores, excerpt: transcriptExcerpt(result) };
	});
}

export function buildContextPackage(
	pitchName: string,
	pitchText: string,
	targetScore: number,
	failed: FailedEval[],
): string {
	let context = `CURRENT PITCH: ${pitchName}\n${pitchText}\n\nTARGET SCORE: ${targetScore}\n\nFAILED EVALUATIONS:\n`;
	for (const [index, entry] of failed.entries()) {
		const failedChecks = entry.scores.compliance
			.filter((check) => !check.pass)
			.map((check) => check.check)
			.join(", ");
		context += `\n--- Evaluation ${index + 1} ---\n`;
		context += `Persona: ${entry.personaLabel} (${entry.personaId})\n`;
		context += `Scores: taskCompletion=${entry.scores.taskCompletion}, efficiency=${entry.scores.efficiency}\n`;
		context += `Compliance failures: ${failedChecks === "" ? "none" : failedChecks}\n`;
		context += `Transcript excerpt:\n${entry.excerpt}\n`;
	}
	context += `\nIMPROVEMENT GUIDELINES:\n- Address only the failed checks and below-target scores.\n- Never add language that requests documents or financial information on a cold call.\n- Never add language that pressures a recipient after a refusal.\n- Every terminal branch keeps its own closing line.\n`;
	return context;
}

export function draftPatchesFor(failed: FailedEval): PatchOp[] {
	const patches: PatchOp[] = [];
	const failedChecks = new Set(
		failed.scores.compliance.filter((check) => !check.pass).map((check) => check.check),
	);
	if (failedChecks.has("no-document-without-consent")) {
		patches.push({
			op: "add-consent-gate",
			text: "Before any document or financial detail is discussed, ask for an explicit affirmative and record it; silence, ambiguity and recognition are never consent.",
			rationale: "A simulated segment requested documents before consent was recorded.",
		});
	}
	if (failedChecks.has("clarify-once")) {
		patches.push({
			op: "tighten-segment",
			text: "Remove any second clarify probe: after the single clarify allowance is spent, the next brush-off, deferral, silence or deflection terminates the call with the branch closing line.",
			rationale: "The simulation probed again after the clarify budget was spent.",
		});
	}
	if (failedChecks.has("closing-line-spoken")) {
		patches.push({
			op: "add-closing-line",
			text: "Every terminal branch ends by speaking its own closing line before end_call; no terminal path ends in silence.",
			rationale: "A simulated call ended without the terminal closing line spoken last.",
		});
	}
	if (failed.scores.taskCompletion < failed.targetScore) {
		patches.push({
			op: "add-clarify-beat",
			text: "After the first brush-off, ask exactly one neutral diagnostic question before continuing; record that clarification was used.",
			rationale: "Task completion scored below target; the single clarify probe was missing or misplaced.",
		});
	}
	if (failed.scores.efficiency < failed.targetScore) {
		patches.push({
			op: "tighten-segment",
			text: "Merge repeated explanation segments so the consent question arrives within the same turn count; drop filler acknowledgements.",
			rationale: "Efficiency scored below target; the script takes too many turns to reach consent.",
		});
	}
	return patches;
}

const PRESSURE = /(overcome|ignore|push past|wear down).{0,30}(refusal|objection|no\b)|convince them|pressure|don't take no|do not take no/i;

export function critiquePatches(patches: PatchOp[], failedIndexes: number[] = []): CritiqueRound {
	const active = patches.filter((_, index) => !failedIndexes.includes(index));
	if (active.length === 0) {
		return { pass: false, feedback: "No patch candidates remain after revision.", droppedIndexes: failedIndexes };
	}
	const dropped = [...failedIndexes];
	for (const [index, patch] of patches.entries()) {
		if (failedIndexes.includes(index)) {
			continue;
		}
		if (patch.text.trim().length === 0) {
			dropped.push(index);
			return { pass: false, feedback: `Patch ${index} (${patch.op}) has no text and was dropped.`, droppedIndexes: dropped };
		}
		if (requestsDocuments(patch.text)) {
			dropped.push(index);
			return { pass: false, feedback: `Patch ${index} (${patch.op}) requests documents and was dropped: cold calls never solicit documents.`, droppedIndexes: dropped };
		}
		if (PRESSURE.test(patch.text)) {
			dropped.push(index);
			return { pass: false, feedback: `Patch ${index} (${patch.op}) pressures past a refusal and was dropped.`, droppedIndexes: dropped };
		}
	}
	return {
		pass: true,
		feedback: `${active.length} patch candidate${active.length === 1 ? "" : "s"} address the failures without touching consent gates, closing lines or refusal policy.`,
		droppedIndexes: dropped,
	};
}

export function runWriterCritiqueCycle(
	pitch: string,
	pitchText: string,
	personasRaw: string,
	failed: FailedEval[],
	targetScore: number,
	maxCycles = 3,
): PitchPatchProposal {
	let patches = failed.flatMap((entry) => draftPatchesFor(entry));
	const seen = new Set<string>();
	patches = patches.filter((patch) => {
		const key = `${patch.op}:${patch.text}`;
		if (seen.has(key)) {
			return false;
		}
		seen.add(key);
		return true;
	});
	const critique: CritiqueRound[] = [];
	let dropped: number[] = [];
	for (let cycle = 0; cycle < maxCycles; cycle += 1) {
		const round = critiquePatches(patches, dropped);
		critique.push(round);
		if (round.pass) {
			break;
		}
		dropped = round.droppedIndexes;
		if (dropped.length >= patches.length) {
			break;
		}
	}
	const surviving = patches.filter((_, index) => !dropped.includes(index));
	return {
		status: "DRAFT",
		pitch,
		createdAt: new Date().toISOString(),
		corpusHash: hashCorpus([pitchText, personasRaw]),
		targetScore,
		evalScores: failed.map((entry) => ({
			personaId: entry.personaId,
			taskCompletion: entry.scores.taskCompletion,
			efficiency: entry.scores.efficiency,
			complianceFailed: entry.scores.compliance
				.filter((check) => !check.pass)
				.map((check) => check.check),
		})),
		patches: surviving,
		writerNotes: `${surviving.length} of ${patches.length} rule-drafted patch candidates survived critique over ${critique.length} round${critique.length === 1 ? "" : "s"}.`,
		critique,
		applyNote:
			"This proposal is a DRAFT: it changes nothing. A human promotes it by editing the pitch file by hand; rollback is checking out the prior pitch file from git.",
	};
}

export async function writePitchProposal(
	proposal: PitchPatchProposal,
	dir = PROPOSALS_DIR,
): Promise<{ ok: true; path: string } | { ok: false; reason: string }> {
	const stamp = proposal.createdAt.replace(/[:.]/g, "-");
	const path = join(dir, `${proposal.pitch}-${stamp}.json`);
	try {
		await mkdir(dir, { recursive: true });
		await writeFile(path, `${JSON.stringify(proposal, null, 2)}\n`, "utf8");
		return { ok: true, path };
	} catch (error) {
		return { ok: false, reason: `The pitch proposal could not be written: ${describe(error)}` };
	}
}
