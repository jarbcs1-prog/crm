import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chunksFromCollateral } from "./layout-ingest.js";

const DATA_DIR = fileURLToPath(new URL("../../data", import.meta.url));
const PITCHES_DIR = join(DATA_DIR, "pitches");
const HANDLERS_FILE = join(DATA_DIR, "objection-handlers.json");

export type PitchChunk = {
	id: string;
	source: "pitch" | "handler";
	pitch: string;
	segment: string;
	title: string;
	text: string;
};

export type MatchedHandler = {
	id: string;
	source: "pitch" | "handler";
	pitch: string;
	segment: string;
	title: string;
};

export function isQdrantConfigured(): boolean {
	return (
		Boolean(process.env.QDRANT_URL?.trim()) &&
		Boolean(process.env.QDRANT_API_KEY?.trim())
	);
}

const STOPWORDS = new Set(
	"a,an,and,are,as,at,be,but,by,do,does,for,from,have,how,i,if,in,is,it,its,me,my,no,not,of,on,or,so,that,the,they,this,to,we,what,when,which,who,with,you,your".split(
		",",
	),
);

function tokensOf(value: string): string[] {
	return value
		.toLowerCase()
		.split(/[^a-z0-9]+/g)
		.filter((token) => token.length > 2 && !STOPWORDS.has(token));
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;
}

function textEntries(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	const out: string[] = [];
	for (const entry of value) {
		const record = asRecord(entry);
		if (record === undefined) continue;
		if (typeof record.text === "string" && record.text.trim().length > 0) {
			out.push(record.text);
		}
	}
	return out;
}

function chunkId(pitch: string, segment: string): string {
	return `${pitch}#${segment}`;
}

async function chunksFromPitches(dir: string): Promise<PitchChunk[]> {
	let names: string[];
	try {
		names = await readdir(dir);
	} catch {
		return [];
	}
	const chunks: PitchChunk[] = [];
	const files = names
		.filter((name) => name.toLowerCase().endsWith(".json"))
		.sort();
	for (const name of files) {
		const stem = name.slice(0, -".json".length);
		let parsed: unknown;
		try {
			parsed = JSON.parse(await readFile(join(dir, name), "utf8")) as unknown;
		} catch {
			continue;
		}
		const record = asRecord(parsed);
		if (record === undefined) continue;
		const pitchName =
			typeof record.name === "string" && record.name.length > 0
				? record.name
				: stem;
		const texts = [
			...textEntries(record.segments),
			...textEntries(record.conversation),
		];
		texts.forEach((text, index) => {
			const segment = `segment-${index + 1}`;
			chunks.push({
				id: chunkId(stem, segment),
				source: "pitch",
				pitch: stem,
				segment,
				title: pitchName,
				text,
			});
		});
		const branches = record.refusal_branches;
		if (Array.isArray(branches)) {
			for (const entry of branches) {
				const branch = asRecord(entry);
				if (
					branch === undefined ||
					typeof branch.id !== "string" ||
					branch.id.length === 0 ||
					typeof branch.text !== "string" ||
					branch.text.trim().length === 0
				) {
					continue;
				}
				const triggers = Array.isArray(branch.trigger)
					? branch.trigger.filter(
							(trigger): trigger is string =>
								typeof trigger === "string" && trigger.length > 0,
						)
					: [];
				chunks.push({
					id: chunkId(stem, `refusal-${branch.id}`),
					source: "pitch",
					pitch: stem,
					segment: `refusal-${branch.id}`,
					title: `${pitchName} refusal branch ${branch.id}`,
					text: [...triggers, branch.text].join(" "),
				});
			}
		}
	}
	return chunks;
}

async function chunksFromHandlers(file: string): Promise<PitchChunk[]> {
	let parsed: unknown;
	try {
		parsed = JSON.parse(await readFile(file, "utf8")) as unknown;
	} catch {
		return [];
	}
	const record = asRecord(parsed);
	const handlers = record?.handlers;
	if (!Array.isArray(handlers)) return [];
	const chunks: PitchChunk[] = [];
	for (const entry of handlers) {
		const handler = asRecord(entry);
		if (
			handler === undefined ||
			typeof handler.id !== "string" ||
			handler.id.length === 0
		) {
			continue;
		}
		const title =
			typeof handler.title === "string" && handler.title.length > 0
				? handler.title
				: handler.id;
		const triggers = Array.isArray(handler.triggers)
			? handler.triggers.filter(
					(trigger): trigger is string =>
						typeof trigger === "string" && trigger.length > 0,
				)
			: [];
		const beats = Array.isArray(handler.beats)
			? handler.beats.filter(
					(beat): beat is string => typeof beat === "string" && beat.length > 0,
				)
			: [];
		const text = [...triggers, ...beats].join(" ").trim();
		if (text.length === 0) continue;
		chunks.push({
			id: `handler:${handler.id}`,
			source: "handler",
			pitch: "objection-handlers",
			segment: handler.id,
			title,
			text,
		});
	}
	return chunks;
}

export async function loadPitchCorpus(override?: {
	pitchesDir?: string;
	handlersFile?: string;
	collateralDir?: string | false;
}): Promise<PitchChunk[]> {
	const [pitchChunks, handlerChunks, collateralChunks] = await Promise.all([
		chunksFromPitches(override?.pitchesDir ?? PITCHES_DIR),
		chunksFromHandlers(override?.handlersFile ?? HANDLERS_FILE),
		override?.collateralDir === false
			? []
			: chunksFromCollateral(override?.collateralDir),
	]);
	return [...pitchChunks, ...handlerChunks, ...collateralChunks];
}

function scoreChunk(queryTokens: Set<string>, chunk: PitchChunk): number {
	let hits = 0;
	for (const token of new Set(tokensOf(chunk.text))) {
		if (queryTokens.has(token)) hits += 1;
	}
	return hits;
}

export function searchPitchCorpus(
	corpus: PitchChunk[],
	query: string,
	limit = 3,
): MatchedHandler[] {
	const queryTokens = new Set(tokensOf(query));
	if (queryTokens.size === 0 || corpus.length === 0) return [];
	const ranked = corpus
		.map((chunk) => ({ chunk, score: scoreChunk(queryTokens, chunk) }))
		.filter((entry) => entry.score > 0)
		.sort(
			(a, b) => b.score - a.score || a.chunk.text.length - b.chunk.text.length,
		)
		.slice(0, Math.max(1, limit));
	return ranked.map(({ chunk }) => ({
		id: chunk.id,
		source: chunk.source,
		pitch: chunk.pitch,
		segment: chunk.segment,
		title: chunk.title,
	}));
}
