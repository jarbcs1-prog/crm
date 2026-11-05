import { readFile } from "node:fs/promises";
import {
	checkToolCallIdLinkage,
	estimateTokens,
	parseJsonl,
} from "./common.js";

async function main() {
	const input = process.argv[2] ?? "data/tool-calling.jsonl";
	const raw = await readFile(input, "utf-8").catch(() => "");
	if (!raw.trim()) {
		console.log(`tool-calling: no data at ${input}`);
		process.exit(0);
	}
	const records = parseJsonl(raw) as Array<Record<string, unknown>>;
	let errors = 0;
	let tokens = 0;
	for (let i = 0; i < records.length; i++) {
		const r = records[i];
		if (!r!.id || !r!.messages) {
			console.error(`line ${i + 1}: missing id/messages`);
			errors++;
			continue;
		}
		const msgs = r!.messages as Array<{
			role: string;
			content: string;
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
						console.error(`line ${i + 1}: bad arguments ${tc.id}`);
						errors++;
					}
				}
			tokens += estimateTokens(m.content ?? "");
		}
		for (const e of checkToolCallIdLinkage(msgs)) {
			console.error(`line ${i + 1}: ${e}`);
			errors++;
		}
	}
	console.log(
		`tool-calling: ${records.length} records, ~${tokens} tokens, ${errors} errors`,
	);
	process.exit(errors ? 1 : 0);
}
main();
