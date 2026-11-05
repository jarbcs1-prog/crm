import { z } from "zod";
import { sensitiveWrite } from "../lib/approval";
import {
	buildContextPackage,
	evaluatePitch,
	loadPersonas,
	loadSimPitch,
	runWriterCritiqueCycle,
	writePitchProposal,
} from "../lib/pitch-tune";
import { defineTool } from "../lib/tool-factory";

export default defineTool({
	description:
		"Runs the offline call simulator against the persona fixtures for one pitch and drafts a Writer-Critique pitch patch proposal. The simulator never touches SIP or the network; the proposal is a DRAFT file under data/pitch-proposals and changes nothing until a human edits the pitch by hand.",
	inputSchema: z.object({
		pitchId: z
			.string()
			.min(1)
			.describe("The pitch to simulate, as listed by load_pitch."),
		personaId: z
			.string()
			.min(1)
			.optional()
			.describe(
				"Simulate one persona only. Omit it to run the full fixture set.",
			),
		targetScore: z
			.number()
			.min(0)
			.max(1)
			.optional()
			.describe(
				"Task completion and efficiency target between 0 and 1. Defaults to 0.8.",
			),
	}),
	approval: sensitiveWrite(
		"Proposals change what the agent says on live calls once applied: review the DRAFT file and apply it by hand instead of running this unattended.",
	),
	async execute({ pitchId, personaId, targetScore }) {
		const target = targetScore ?? 0.8;
		const pitch = await loadSimPitch(pitchId);
		if (!pitch.ok) {
			return { proposed: false as const, reason: pitch.reason };
		}
		const fixtures = await loadPersonas();
		if (!fixtures.ok) {
			return { proposed: false as const, reason: fixtures.reason };
		}
		const personas =
			personaId === undefined
				? fixtures.personas
				: fixtures.personas.filter((persona) => persona.id === personaId);
		if (personas.length === 0) {
			return {
				proposed: false as const,
				reason: `No persona matched "${personaId}".`,
			};
		}
		const results = evaluatePitch(
			pitch.segments,
			pitch.branches,
			personas,
			target,
		);
		const failed = results
			.filter(
				(entry) =>
					entry.scores.taskCompletion < target ||
					entry.scores.efficiency < target ||
					!entry.scores.pass,
			)
			.map((entry) => ({
				personaId: entry.persona.id,
				personaLabel: entry.persona.label,
				targetScore: target,
				scores: entry.scores,
				excerpt: entry.excerpt,
			}));
		if (failed.length === 0) {
			return {
				proposed: false as const,
				pitch: pitch.stem,
				personasRun: personas.length,
				reason: `All ${personas.length} simulated persona${personas.length === 1 ? "" : "s"} met target ${target}.`,
			};
		}
		const contextPackage = buildContextPackage(
			pitch.stem,
			pitch.raw,
			target,
			failed,
		);
		const proposal = runWriterCritiqueCycle(
			pitch.stem,
			pitch.raw,
			fixtures.raw,
			failed,
			target,
		);
		const written = await writePitchProposal(proposal);
		if (!written.ok) {
			return { proposed: false as const, reason: written.reason };
		}
		return {
			proposed: true as const,
			pitch: pitch.stem,
			personasRun: personas.length,
			personasFailed: failed.map((entry) => entry.personaId),
			path: written.path,
			corpusHash: proposal.corpusHash,
			patches: proposal.patches,
			critique: proposal.critique,
			contextPackage,
			note: proposal.applyNote,
		};
	},
});
