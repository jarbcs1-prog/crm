import { describe, expect, it } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	buildContextPackage,
	critiquePatches,
	draftPatchesFor,
	type FailedEval,
	hashCorpus,
	loadPersonas,
	loadSimPitch,
	runWriterCritiqueCycle,
	writePitchProposal,
} from "../agent/lib/pitch-tune";

function failedEval(overrides: Partial<FailedEval> = {}): FailedEval {
	return {
		personaId: "brush-off",
		personaLabel: "Brush-off",
		targetScore: 0.8,
		scores: {
			taskCompletion: 0.2,
			efficiency: 0.4,
			interest: 0.3,
			motivation: 0.2,
			urgency: 0.2,
			experience: 0.4,
			budget: 0.2,
			compliance: [
				{ check: "no-document-without-consent", pass: true, detail: "clean" },
				{ check: "clarify-once", pass: false, detail: "probed twice" },
				{ check: "closing-line-spoken", pass: true, detail: "spoken" },
				{ check: "do-not-contact-honored", pass: true, detail: "n/a" },
			],
			pass: false,
		},
		excerpt: "AGENT: Hello\nCALLER: I'm not interested.",
		...overrides,
	};
}

describe("pitch-tune", () => {
	it("loads the checked-in pitch and persona fixtures", async () => {
		const pitch = await loadSimPitch("scam-recovery-v2.1");
		expect(pitch.ok).toBe(true);
		if (pitch.ok) {
			expect(pitch.segments.length).toBeGreaterThan(0);
			expect(pitch.branches.map((branch) => branch.id)).toContain("r1_explicit_refusal");
		}
		const fixtures = await loadPersonas();
		expect(fixtures.ok).toBe(true);
		if (fixtures.ok) {
			expect(fixtures.personas).toHaveLength(8);
		}
	});

	it("reports unknown pitch and persona ids instead of throwing", async () => {
		const pitch = await loadSimPitch("no-such-pitch");
		expect(pitch.ok).toBe(false);
	});

	it("builds a context package with scores and transcript", () => {
		const failed = failedEval();
		const context = buildContextPackage("demo", "PITCH TEXT", 0.8, [failed]);
		expect(context).toContain("TARGET SCORE: 0.8");
		expect(context).toContain("taskCompletion=0.2");
		expect(context).toContain("clarify-once");
		expect(context).toContain("AGENT: Hello");
	});

	it("drafts patches that map to the failed checks", () => {
		const patches = draftPatchesFor(failedEval());
		expect(patches.map((patch) => patch.op)).toContain("tighten-segment");
		expect(patches.map((patch) => patch.op)).toContain("add-clarify-beat");
	});

	it("passes clean patches and drops document-requesting ones on revision", () => {
		const good = draftPatchesFor(failedEval());
		const mixed = [
			...good,
			{
				op: "tighten-segment" as const,
				text: "Ask them to send their bank statements to move faster.",
				rationale: "bad candidate",
			},
		];
		const first = critiquePatches(mixed);
		expect(first.pass).toBe(false);
		expect(first.droppedIndexes).toHaveLength(1);
		const second = critiquePatches(mixed, first.droppedIndexes);
		expect(second.pass).toBe(true);
	});

	it("drops pressure-past-refusal language", () => {
		const round = critiquePatches([
			{
				op: "add-clarify-beat" as const,
				text: "Overcome the refusal by convincing them to stay on the line.",
				rationale: "bad candidate",
			},
		]);
		expect(round.pass).toBe(false);
	});

	it("runs the cycle to a DRAFT proposal with eval scores and corpus hash", () => {
		const proposal = runWriterCritiqueCycle(
			"demo",
			"PITCH TEXT",
			"PERSONAS RAW",
			[failedEval()],
			0.8,
		);
		expect(proposal.status).toBe("DRAFT");
		expect(proposal.corpusHash).toBe(hashCorpus(["PITCH TEXT", "PERSONAS RAW"]));
		expect(proposal.evalScores[0]?.personaId).toBe("brush-off");
		expect(proposal.critique.length).toBeGreaterThan(0);
		expect(proposal.patches.length).toBeGreaterThan(0);
	});

	it("hashes the corpus deterministically", () => {
		expect(hashCorpus(["a", "b"])).toBe(hashCorpus(["a", "b"]));
		expect(hashCorpus(["a", "b"])).not.toBe(hashCorpus(["a", "c"]));
	});

	it("writes proposals to a directory without touching the pitch files", async () => {
		const dir = join(tmpdir(), `pitch-tune-test-${Date.now()}`);
		const proposal = runWriterCritiqueCycle(
			"demo",
			"PITCH TEXT",
			"PERSONAS RAW",
			[failedEval()],
			0.8,
		);
		const written = await writePitchProposal(proposal, dir);
		expect(written.ok).toBe(true);
		if (written.ok) {
			const { readFile, readdir } = await import("node:fs/promises");
			const raw = await readFile(written.path, "utf8");
			const parsed = JSON.parse(raw) as { status: string; corpusHash: string };
			expect(parsed.status).toBe("DRAFT");
			expect(parsed.corpusHash).toBe(proposal.corpusHash);
			expect(written.path.startsWith(dir)).toBe(true);
			expect((await readdir(dir))).toHaveLength(1);
		}
	});
});
