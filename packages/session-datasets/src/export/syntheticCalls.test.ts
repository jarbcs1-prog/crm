import { describe, expect, it } from "bun:test";
import {
	buildSyntheticCalls,
	loadPitchSegments,
	type SyntheticPersona,
	type SyntheticPitchSegment,
	synthesizeSession,
} from "./syntheticCalls.js";

const persona: SyntheticPersona = {
	id: "cooperative",
	script: ["Yes, I have a moment.", "Go on."],
	defaultReply: "All right, go on.",
};

const segments: SyntheticPitchSegment[] = [
	{ pitch: "demo", id: "s1", text: "Hello, thirty seconds?" },
	{ pitch: "demo", id: "s2", text: "Here is why I call." },
];

describe("synthesizeSession", () => {
	it("alternates assistant segments with persona replies and closes", () => {
		const s = synthesizeSession("demo", segments, persona);
		expect(s.meta.source).toBe("synthetic-call");
		expect(s.meta.tags).toContain("source:synthetic-cooperative");
		expect(s.meta.tags).toContain("pitch:demo");
		expect(s.turns[0]).toMatchObject({
			role: "assistant",
			content: "Hello, thirty seconds?",
		});
		expect(s.turns[1]).toMatchObject({
			role: "user",
			content: "Yes, I have a moment.",
		});
		expect(s.turns[s.turns.length - 1]!.role).toBe("assistant");
	});

	it("falls back to defaultReply when the script runs short", () => {
		const s = synthesizeSession(
			"demo",
			[...segments, { pitch: "demo", id: "s3", text: "Third beat." }],
			persona,
		);
		expect(s.turns[5]).toMatchObject({
			role: "user",
			content: "All right, go on.",
		});
	});

	it("is deterministic per pitch and persona", () => {
		expect(synthesizeSession("demo", segments, persona).id).toBe(
			synthesizeSession("demo", segments, persona).id,
		);
	});
});

describe("buildSyntheticCalls", () => {
	it("dedups repeated persona entries", () => {
		const out = buildSyntheticCalls([persona, persona], segments);
		expect(out.sessions.length).toBe(1);
		expect(out.duplicates).toBe(1);
	});

	it("redacts PII in persona scripts", () => {
		const leaky: SyntheticPersona = {
			id: "leaky",
			script: ["mail me at lead@example.com"],
			defaultReply: "ok",
		};
		const out = buildSyntheticCalls([leaky], segments);
		expect(out.redacted).toBe(1);
		expect(JSON.stringify(out.sessions)).not.toContain("lead@example.com");
	});
});

describe("loadPitchSegments", () => {
	it("returns [] for a missing directory", () => {
		expect(loadPitchSegments("/nonexistent-pitches-dir")).toEqual([]);
	});
});
