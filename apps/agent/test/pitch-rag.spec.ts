import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
	isQdrantConfigured,
	loadPitchCorpus,
	searchPitchCorpus,
} from "../agent/lib/pitch-rag";

const savedUrl = process.env.QDRANT_URL;
const savedKey = process.env.QDRANT_API_KEY;

beforeEach(() => {
	delete process.env.QDRANT_URL;
	delete process.env.QDRANT_API_KEY;
});

afterEach(() => {
	if (savedUrl === undefined) delete process.env.QDRANT_URL;
	else process.env.QDRANT_URL = savedUrl;
	if (savedKey === undefined) delete process.env.QDRANT_API_KEY;
	else process.env.QDRANT_API_KEY = savedKey;
});

describe("pitch-rag", () => {
	it("loads the checked-in pitch and handler corpus", async () => {
		const corpus = await loadPitchCorpus();
		expect(corpus.length).toBeGreaterThan(0);
		const handlers = corpus.filter((chunk) => chunk.source === "handler");
		expect(handlers.length).toBe(12);
		expect(handlers.map((chunk) => chunk.id)).toContain(
			"handler:has-answering-service",
		);
		const pitches = corpus.filter((chunk) => chunk.source === "pitch");
		expect(pitches.length).toBeGreaterThan(0);
	});

	it("matches an answering-service objection to its handler", async () => {
		const corpus = await loadPitchCorpus();
		const matches = searchPitchCorpus(
			corpus,
			"we already have an answering service",
			3,
		);
		expect(matches.map((match) => match.id)).toContain(
			"handler:has-answering-service",
		);
	});

	it("returns nothing for an empty query instead of guessing", async () => {
		const corpus = await loadPitchCorpus();
		expect(searchPitchCorpus(corpus, "", 3)).toEqual([]);
		expect(searchPitchCorpus(corpus, "   ", 3)).toEqual([]);
	});

	it("falls back to an empty corpus when the data directory is missing", async () => {
		const corpus = await loadPitchCorpus({
			pitchesDir: "F:\\definitely-not-here\\pitches",
			handlersFile: "F:\\definitely-not-here\\handlers.json",
		});
		expect(corpus).toEqual([]);
		expect(searchPitchCorpus(corpus, "answering service", 3)).toEqual([]);
	});

	it("reports Qdrant unconfigured unless both url and key are set", () => {
		expect(isQdrantConfigured()).toBe(false);
		process.env.QDRANT_URL = "https://qdrant.example.test:6333";
		expect(isQdrantConfigured()).toBe(false);
		process.env.QDRANT_API_KEY = "key";
		expect(isQdrantConfigured()).toBe(true);
	});
});
