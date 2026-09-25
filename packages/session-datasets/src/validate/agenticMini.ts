import { readFile } from "node:fs/promises";
import {
	checkToolCallIdLinkage,
	estimateTokens,
	parseJsonl,
} from "./common.js";

async function main() {
	const input = process.argv[2] ?? "data/agentic-mini.jsonl";
	const raw = await readFile(input, "utf-8").catch(() => "");
	if (!raw.trim()) {
		console.log(`agentic-mini: no data at ${input}`);
		process.exit(0);
	}
	const records = parseJsonl(raw) as Array<{
		messages: unknown[];
		metadata: Record<string, unknown>;
	}>;
	let errors = 0;
	let tokens = 0;
	for (let i = 0; i < records.length; i++) {
		const r = records[i] as unknown as Record<string, unknown>;
		if (!Array.isArray(r.messages)) {
			console.error(`line ${i + 1}: missing messages`);
			errors++;
			continue;
		}
		if (!r.metadata || typeof r.metadata !== "object") {
			console.error(`line ${i + 1}: missing metadata`);
			errors++;
		}
		const msgs = r.messages as Array<{
			role: string;
			content: unknown;
			tool_calls?: Array<{
				id: string;
				function: { name: string; arguments: string };
			}>;
			tool_call_id?: string;
		}>;
		for (const m of msgs) {
			if (m.tool_calls)
				for (const tc of m.tool_calls) {
					try {
						JSON.parse(tc.function.arguments);
					} catch {
						console.error(`line ${i + 1}: invalid JSON arguments for ${tc.id}`);
						errors++;
					}
				}
			tokens += estimateTokens(
				typeof m.content === "string"
					? m.content
					: JSON.stringify(m.content ?? ""),
			);
		}
		const linkage = checkToolCallIdLinkage(msgs);
		for (const e of linkage) {
			console.error(`line ${i + 1}: ${e}`);
			errors++;
		}
	}
	console.log(
		`agentic-mini: ${records.length} records, ~${tokens} tokens, ${errors} errors`,
	);
	try {
		const { spawnSync } = await import("node:child_process");
		const helper = input.replace(/\.jsonl$/i, ".parquet");
		const res = spawnSync(
			"python",
			[
				"-c",
				`import pyarrow.parquet as pq; t=pq.read_table(r"${helper}"); print(f"parquet: {t.num_rows} rows, schema: {t.schema}")`,
			],
			{ encoding: "utf-8", timeout: 10000 },
		);
		if (res.stdout) console.log(res.stdout.trim());
		if (res.stderr && !res.stderr.includes("No such file"))
			console.error(res.stderr.trim());
	} catch {}
	process.exit(errors ? 1 : 0);
}
main();
