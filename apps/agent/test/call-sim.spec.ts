import { describe, expect, it } from "bun:test";
import {
	runSimulation,
	type SimBranch,
	type SimPersona,
	type SimSegment,
	scoreSimulation,
} from "../agent/lib/call-sim";

const SEGMENTS: SimSegment[] = [
	{ id: "s1", text: "Hello, do you have a moment?", listenAfter: true },
	{ id: "s2", text: "Here is why I am calling.", listenAfter: true },
	{ id: "s3", text: "Would you arrange a follow-up?", listenAfter: true },
	{ id: "s4", text: "Thank you, goodbye.", listenAfter: false },
];

const BRANCHES: SimBranch[] = [
	{ id: "r1", trigger: ["I don't want to participate", "No"], action: "TERMINATE", text: "Understood, goodbye." },
	{ id: "r2", trigger: ["Don't call me again"], action: "TERMINATE_AND_OPTOUT", text: "Recorded, goodbye." },
	{ id: "r3", trigger: ["not interested"], action: "CLARIFY_ONCE", text: "May I ask what puts you off?" },
	{ id: "r5", trigger: ["Wrong number"], action: "TERMINATE", text: "Wrong number, goodbye." },
	{ id: "r7", trigger: ["call me later", "busy"], action: "CLARIFY_ONCE", text: "Would tomorrow or the day after work?" },
];

function persona(id: string, script: string[]): SimPersona {
	return { id, label: id, objective: id, script, defaultReply: "Go on." };
}

describe("call-sim", () => {
	it("reaches consent with a cooperative caller", () => {
		const result = runSimulation(
			SEGMENTS,
			BRANCHES,
			persona("cooperative", ["Yes, I have a moment.", "Go on.", "Yes, arrange it."]),
		);
		expect(result.terminalKind).toBe("consent");
		expect(result.consentGranted).toBe(true);
		expect(result.terminalBranchId).toBeUndefined();
		const scores = scoreSimulation(result, SEGMENTS.length);
		expect(scores.pass).toBe(true);
		expect(scores.taskCompletion).toBe(1);
	});

	it("terminates an explicit refusal with the closing line last", () => {
		const result = runSimulation(
			SEGMENTS,
			BRANCHES,
			persona("refusal", ["I don't want to participate."]),
		);
		expect(result.terminalKind).toBe("refusal");
		expect(result.terminalBranchId).toBe("r1");
		expect(result.turns.at(-1)).toEqual({
			speaker: "agent",
			text: "Understood, goodbye.",
			branchId: "r1",
		});
		const scores = scoreSimulation(result, SEGMENTS.length, "TERMINATE");
		expect(scores.pass).toBe(true);
	});

	it("clarifies once on a brush-off then terminates on the second", () => {
		const result = runSimulation(
			SEGMENTS,
			BRANCHES,
			persona("brush-off", ["I'm not interested.", "I said I'm not interested."]),
		);
		expect(result.clarifyUsed).toBe(true);
		expect(result.clarifyTwice).toBe(true);
		expect(result.terminalBranchId).toBe("r3");
		expect(result.turns.at(-1)?.text).toBe("May I ask what puts you off?");
		const scores = scoreSimulation(result, SEGMENTS.length, "CLARIFY_ONCE");
		expect(scores.compliance.find((entry) => entry.check === "clarify-once")?.pass).toBe(false);
		expect(scores.pass).toBe(false);
	});

	it("pins down a deferral then terminates on repeat-later-without-time", () => {
		const result = runSimulation(
			SEGMENTS,
			BRANCHES,
			persona("deferral", ["I am busy, call me later.", "Just call me later."]),
		);
		expect(result.clarifyUsed).toBe(true);
		expect(result.terminalBranchId).toBe("r7");
		expect(result.terminalKind).toBe("refusal");
	});

	it("fails compliance when a segment requests documents without consent", () => {
		const docSegments: SimSegment[] = [
			{ id: "s1", text: "Please send me your bank statements.", listenAfter: true },
		];
		const result = runSimulation(docSegments, BRANCHES, persona("any", ["Hello?"]));
		expect(result.documentRequestedWithoutConsent).toBe(true);
		const scores = scoreSimulation(result, docSegments.length);
		expect(
			scores.compliance.find((entry) => entry.check === "no-document-without-consent")?.pass,
		).toBe(false);
	});

	it("does not flag segments that disavow document collection", () => {
		const clean: SimSegment[] = [
			{ id: "s1", text: "I will not ask you to provide documents on this call.", listenAfter: true },
		];
		const result = runSimulation(clean, BRANCHES, persona("any", ["Okay."]));
		expect(result.documentRequestedWithoutConsent).toBe(false);
	});

	it("honors do-not-contact with no agent turn after the opt-out", () => {
		const result = runSimulation(
			SEGMENTS,
			BRANCHES,
			persona("dnc", ["Don't call me again."]),
		);
		expect(result.terminalBranchId).toBe("r2");
		const scores = scoreSimulation(result, SEGMENTS.length, "TERMINATE_AND_OPTOUT");
		expect(
			scores.compliance.find((entry) => entry.check === "do-not-contact-honored")?.pass,
		).toBe(true);
	});

	it("terminates a wrong number without asking for the correct one", () => {
		const result = runSimulation(
			SEGMENTS,
			BRANCHES,
			persona("wrong", ["You have the wrong number."]),
		);
		expect(result.terminalBranchId).toBe("r5");
		expect(result.segmentsSpoken).toBe(1);
	});

	it("is deterministic for the same inputs", () => {
		const caller = persona("brush-off", ["I'm not interested.", "Still not interested."]);
		const first = runSimulation(SEGMENTS, BRANCHES, caller);
		const second = runSimulation(SEGMENTS, BRANCHES, caller);
		expect(second).toEqual(first);
	});
});
