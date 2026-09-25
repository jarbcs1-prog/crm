import { readFile } from "node:fs/promises";
import { estimateTokens, parseJsonl } from "./common.js";

async function main() {
  const input = process.argv[2] ?? "data/safety-routing.jsonl";
  const raw = await readFile(input, "utf-8").catch(() => "");
  if (!raw.trim()) { console.log(`safety: no data at ${input}`); process.exit(0); }
  const records = parseJsonl(raw) as Array<Record<string, unknown>>;
  let errors = 0;
  let tokens = 0;
  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    if (!r!.id || !r!.task_type || !r!.messages || !r!.target) { console.error(`line ${i + 1}: missing required field`); errors++; continue; }
    const msgs = r!.messages as Array<{ content: string }>;
    for (const m of msgs) tokens += estimateTokens(m.content ?? "");
    const target = r!.target as Record<string, unknown>;
    if (target.tool_calls && !Array.isArray(target.tool_calls)) { console.error(`line ${i + 1}: target.tool_calls not array`); errors++; }
  }
  console.log(`safety: ${records.length} records, ~${tokens} tokens, ${errors} errors`);
  process.exit(errors ? 1 : 0);
}
main();
