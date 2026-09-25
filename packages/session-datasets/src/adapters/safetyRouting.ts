import * as fs from "node:fs";
import * as path from "node:path";
import type { SafetyRoutingRecord, Session } from "../schema.js";
import { TOOL_VOCAB } from "../schema.js";

const TAXONOMY_TASKS = [
	"debug_recovery",
	"command_execution",
	"tool_routing",
	"safety_boundary",
	"response_quality",
] as const;
const SYSTEM_PROMPT =
	"You are Clawd, an AI assistant that routes tasks safely and executes tools responsibly.";

const HEURISTICS: Array<{ pattern: RegExp; task: string; taxonomy: string[] }> =
	[
		{
			pattern: /rm\s+-rf|sudo|chmod|delete|drop table/i,
			taxonomy: ["safety_boundary", "command_execution"],
			task: "safety_boundary",
		},
		{
			pattern: /error|fail|stack.?trace|exception/i,
			taxonomy: ["debug_recovery", "response_quality"],
			task: "debug_recovery",
		},
		{
			pattern: /exec|run|execute|command/i,
			taxonomy: ["command_execution"],
			task: "command_execution",
		},
		{
			pattern: /inappropriate|harmful|refuse|policy/i,
			taxonomy: ["safety_boundary"],
			task: "safety_boundary",
		},
	];

function inferTaxonomy(session: Session): {
	taskType: string;
	taxonomy: string[];
} {
	const text = session.turns.map((t) => t.content).join(" ");
	for (const h of HEURISTICS) {
		if (h.pattern.test(text)) return { taskType: h.task, taxonomy: h.taxonomy };
	}
	return {
		taskType: session.meta.task_type ?? "tool_routing",
		taxonomy: session.meta.tags.length ? session.meta.tags : ["tool_routing"],
	};
}

export interface SafetyRoutingOutput extends SafetyRoutingRecord {
	taxonomy: string[];
	system: string;
}

export function sessionToSafetyRouting(
	session: Session,
	idPrefix = "ds",
): SafetyRoutingOutput {
	const userTurn = session.turns.find((t) => t.role === "user");
	const assistantTurns = session.turns.filter((t) => t.role === "assistant");
	const lastAssistant = assistantTurns[assistantTurns.length - 1];
	const toolCalls = session.turns.flatMap((t) => t.tool_calls ?? []);
	const inferred = inferTaxonomy(session);
	const baseTaskType = session.meta.task_type ?? inferred.taskType;
	const taxonomy = [...new Set([...inferred.taxonomy, ...session.meta.tags])];
	if (!taxonomy.length) taxonomy.push(baseTaskType);

	return {
		id: `${idPrefix}_${session.id}`,
		system: session.meta.system_prompt ?? SYSTEM_PROMPT,
		task_type: baseTaskType,
		messages: [
			{ role: "system", content: session.meta.system_prompt ?? SYSTEM_PROMPT },
			{ role: "user", content: userTurn?.content ?? "" },
		],
		tools_available: session.meta.tools_available ?? [...TOOL_VOCAB],
		target: {
			assistant: lastAssistant?.content ?? "Acknowledged. Proceeding.",
			tool_calls: toolCalls.map((tc) => ({
				name: tc.name,
				arguments: tc.arguments,
			})),
			final_response: lastAssistant?.content ?? "",
		},
		taxonomy,
		...(session.meta.quality
			? { quality: session.meta.quality as SafetyRoutingRecord["quality"] }
			: {}),
		metadata: { source: session.meta.source, tags: session.meta.tags },
	};
}

export function convertSessions(sessions: Session[]): SafetyRoutingOutput[] {
	return sessions.map((s) => sessionToSafetyRouting(s));
}

export async function buildSafetyRouting(
	inputPath: string,
	outPath: string,
): Promise<void> {
	const raw = await fs.promises.readFile(inputPath, "utf-8");
	const sessions: Session[] = raw
		.trim()
		.split("\n")
		.filter(Boolean)
		.map((l) => JSON.parse(l));
	const records = convertSessions(sessions);
	await fs.promises.mkdir(path.dirname(outPath), { recursive: true });
	await fs.promises.writeFile(
		outPath,
		records.map((r) => JSON.stringify(r)).join("\n") +
			(records.length ? "\n" : ""),
	);
	const dist: Record<string, number> = {};
	for (const r of records)
		for (const t of r.taxonomy) dist[t] = (dist[t] ?? 0) + 1;
	console.log("taxonomy distribution:", JSON.stringify(dist));
}

const args = process.argv.slice(2);
if (args.includes("--input")) {
	const inputIdx = args.indexOf("--input");
	const outIdx = args.indexOf("--out");
	buildSafetyRouting(
		args[inputIdx + 1] as string,
		outIdx !== -1 ? (args[outIdx + 1] as string) : "data/safety-routing.jsonl",
	).catch((e) => {
		console.error(e);
		process.exit(1);
	});
}
