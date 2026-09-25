import { readFile } from "node:fs/promises";
import { estimateTokens, parseJsonl } from "./common.js";

async function main() {
  const files = ["data/canonical.jsonl", "data/agentic-mini.jsonl", "data/tool-calling.jsonl", "data/safety-routing.jsonl"];
  for (const f of files) {
    const raw = await readFile(f, "utf-8").catch(() => "");
    if (!raw.trim()) { console.log(`${f}: empty/missing`); continue; }
    const recs = parseJsonl(raw);
    const perSource: Record<string, number> = {};
    let tokens = 0;
    for (const r of recs as Array<Record<string, unknown>>) {
      const src = ((r.metadata as Record<string, unknown>)?.source as string) ?? ((r.meta as Record<string, unknown>)?.source as string) ?? "unknown";
      perSource[src] = (perSource[src] ?? 0) + 1;
      tokens += estimateTokens(JSON.stringify(r).slice(0, 4000));
    }
    console.log(`${f}: ${recs.length} records, ~${tokens} tokens`);
    console.log(`  per-source: ${JSON.stringify(perSource)}`);
  }
}
main();
