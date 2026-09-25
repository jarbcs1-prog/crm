import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { dedup } from "../dedup.js";
import { scrubSession } from "../pii.js";
import type { Session } from "../schema.js";
import { writeBundles } from "./easyDataset.js";

export interface CallRecord {
	id: string;
	transcript?: string | null;
	summary?: string | null;
	outcome?: string | null;
	scores?: Record<string, number | null | undefined>;
	direction?: string;
	durationSeconds?: number | null;
	pitchId?: string;
}

export const CALL_SCORE_KEYS = [
	"control",
	"liquidity",
	"interest",
	"decisionMaker",
	"motivation",
	"urgency",
	"experience",
	"budget",
] as const;

export function definedScores(
	record: CallRecord,
): Array<{ key: string; value: number }> {
	const out: Array<{ key: string; value: number }> = [];
	for (const key of CALL_SCORE_KEYS) {
		const v = record.scores?.[key];
		if (typeof v === "number" && Number.isFinite(v))
			out.push({ key, value: v });
	}
	return out;
}

export function callToSession(record: CallRecord): Session | null {
	const transcript = (record.transcript ?? "").trim();
	const summary = (record.summary ?? "").trim();
	if (!transcript && !summary) return null;
	const outcome = (record.outcome ?? "UNKNOWN").trim() || "UNKNOWN";
	const scores = definedScores(record);
	const scoreText = scores.length
		? scores.map((s) => `${s.key}=${s.value}`).join(", ")
		: "no scores recorded";
	const tags = ["source:call-transcript", `outcome:${outcome}`];
	if (record.pitchId) tags.push(`pitch:${record.pitchId}`);
	return {
		id: `call_${record.id}`,
		turns: [
			{ role: "user", content: transcript || summary },
			{
				role: "assistant",
				content: `Outcome: ${outcome}. Scores: ${scoreText}.${summary && transcript ? ` Summary: ${summary}` : ""}`,
			},
		],
		meta: {
			source: "call-transcript",
			task_type: "call-outcome",
			tags,
			tools_available: [],
			has_tool_use: false,
			has_reasoning: false,
			extra: {
				callId: record.id,
				outcome,
				scores: Object.fromEntries(scores.map((s) => [s.key, s.value])),
				direction: record.direction ?? null,
				durationSeconds: record.durationSeconds ?? null,
				pitchId: record.pitchId ?? null,
			},
		},
	};
}

export interface JudgeResult {
	sessionId: string;
	callId: string;
	score: number;
	checks: {
		hasTranscript: boolean;
		hasOutcome: boolean;
		hasScores: boolean;
		hasSummary: boolean;
	};
}

export function judgeCallSession(session: Session): JudgeResult {
	const userText = session.turns.find((t) => t.role === "user")?.content ?? "";
	const extra = (session.meta.extra ?? {}) as Record<string, unknown>;
	const outcome = extra.outcome;
	const scores = (extra.scores ?? {}) as Record<string, unknown>;
	const checks = {
		hasTranscript: userText.trim().length > 0,
		hasOutcome: typeof outcome === "string" && outcome !== "UNKNOWN",
		hasScores: Object.keys(scores).length > 0,
		hasSummary: session.turns.some(
			(t) => t.role === "assistant" && t.content.includes("Summary:"),
		),
	};
	const values = Object.values(checks);
	const score = values.filter(Boolean).length / values.length;
	return {
		sessionId: session.id,
		callId: String(extra.callId ?? session.id),
		score,
		checks,
	};
}

export interface ArenaEntry {
	label: string;
	variant: string;
	n: number;
	meanScore: number;
}

export interface ArenaReport {
	blinded: ArenaEntry[];
	reveal: Record<string, string>;
	winner: string | null;
	note: string;
}

export function arenaCompare(
	sessions: Session[],
	variantOf: (s: Session) => string | null,
): ArenaReport {
	const groups = new Map<string, JudgeResult[]>();
	for (const s of sessions) {
		const variant = variantOf(s);
		if (!variant) continue;
		const list = groups.get(variant) ?? [];
		list.push(judgeCallSession(s));
		groups.set(variant, list);
	}
	const ranked = [...groups.keys()].sort((a, b) =>
		createHash("sha256").update(a).digest("hex") <
		createHash("sha256").update(b).digest("hex")
			? -1
			: 1,
	);
	const reveal: Record<string, string> = {};
	const blinded: ArenaEntry[] = ranked.map((variant, i) => {
		const label = `Variant ${String.fromCharCode(65 + i)}`;
		reveal[label] = variant;
		const results = groups.get(variant)!;
		const meanScore =
			results.reduce((sum, r) => sum + r.score, 0) / results.length;
		return { label, variant, n: results.length, meanScore };
	});
	const winner = blinded.length
		? blinded.slice().sort((a, b) => b.meanScore - a.meanScore || b.n - a.n)[0]!
				.label
		: null;
	return {
		blinded: blinded.map(({ label, n, meanScore }) => ({
			label,
			variant: label,
			n,
			meanScore,
		})),
		reveal,
		winner,
		note: "Deterministic rules judge (transcript/outcome/scores/summary presence). Variants blinded by sha256 order; reveal maps label back to variant.",
	};
}

export function variantByPitch(session: Session): string | null {
	const extra = (session.meta.extra ?? {}) as Record<string, unknown>;
	return typeof extra.pitchId === "string" && extra.pitchId
		? extra.pitchId
		: null;
}

export interface CallDatasetOutputs {
	sessions: Session[];
	skipped: number;
	duplicates: number;
	redacted: number;
	judged: JudgeResult[];
	arena: ArenaReport;
}

export function buildCallDataset(records: CallRecord[]): CallDatasetOutputs {
	let skipped = 0;
	const converted: Session[] = [];
	for (const r of records) {
		const s = callToSession(r);
		if (!s) skipped++;
		else converted.push(s);
	}
	const { unique, duplicates } = dedup(converted);
	let redacted = 0;
	const clean: Session[] = [];
	for (const s of unique) {
		const res = scrubSession(s, {});
		if (res) {
			if (res.redacted) redacted++;
			clean.push(res.session);
		} else skipped++;
	}
	return {
		sessions: clean,
		skipped,
		duplicates,
		redacted,
		judged: clean.map(judgeCallSession),
		arena: arenaCompare(clean, variantByPitch),
	};
}

export function writeCallDataset(
	records: CallRecord[],
	outDir: string,
): CallDatasetOutputs {
	const outputs = buildCallDataset(records);
	mkdirSync(outDir, { recursive: true });
	writeFileSync(
		join(outDir, "call-canonical.jsonl"),
		outputs.sessions.map((s) => JSON.stringify(s)).join("\n") +
			(outputs.sessions.length ? "\n" : ""),
		"utf-8",
	);
	writeBundles(outputs.sessions, join(outDir, "easydataset"));
	writeFileSync(
		join(outDir, "judge.json"),
		JSON.stringify(outputs.judged, null, 2),
		"utf-8",
	);
	writeFileSync(
		join(outDir, "arena.json"),
		JSON.stringify(outputs.arena, null, 2),
		"utf-8",
	);
	const lines = [
		"# Call dataset arena (blind)",
		"",
		...outputs.arena.blinded.map(
			(e) => `- ${e.label}: n=${e.n} mean=${e.meanScore.toFixed(3)}`,
		),
		"",
		`Winner: ${outputs.arena.winner ?? "none"}`,
		"",
		"## Reveal",
		"",
		...Object.entries(outputs.arena.reveal).map(
			([label, variant]) => `- ${label} = ${variant}`,
		),
		"",
		outputs.arena.note,
		"",
	];
	writeFileSync(join(outDir, "arena.md"), lines.join("\n"), "utf-8");
	return outputs;
}

function parseArgs(argv: string[]): Record<string, string> {
	const out: Record<string, string> = {};
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i]!;
		if (a.startsWith("--")) {
			const key = a.slice(2);
			const val =
				argv[i + 1] && !argv[i + 1]!.startsWith("--") ? argv[++i]! : "true";
			out[key] = val;
		}
	}
	return out;
}

const isMain =
	resolve(process.argv[1] ?? "") ===
	resolve(
		new URL(import.meta.url).pathname
			.replace(/^\//, "")
			.replace(/^([A-Z]):\//, "$1:/"),
	);

if (isMain) {
	const args = parseArgs(process.argv.slice(2));
	const input = args["input"];
	const out = args["out"] ?? "data/call-dataset";
	if (!input) {
		console.error(
			"Usage: bun run src/export/callDataset.ts --input <calls.json> --out <dir>",
		);
		process.exit(1);
	}
	const raw = JSON.parse(readFileSync(input, "utf-8") as string) as
		| CallRecord[]
		| { calls: CallRecord[] };
	const records = Array.isArray(raw) ? raw : raw.calls;
	const outputs = writeCallDataset(records, out);
	console.log(
		`calls: ${records.length} in, ${outputs.sessions.length} sessions, ${outputs.skipped} skipped, ${outputs.duplicates} duplicates, ${outputs.redacted} redacted -> ${out}`,
	);
}
