import { readFile } from "node:fs/promises";
import { parseJsonl } from "./common.js";

const CALL_SOURCES = new Set(["call-transcript", "synthetic-call"]);

async function main() {
  const canonical = process.argv[2] ?? "data/call-dataset/call-canonical.jsonl";
  const judgePath = process.argv[3] ?? "data/call-dataset/judge.json";
  const arenaPath = process.argv[4] ?? "data/call-dataset/arena.json";
  let errors = 0;
  const raw = await readFile(canonical, "utf-8").catch(() => "");
  if (!raw.trim()) {
    console.log(`call-dataset: no data at ${canonical}`);
    process.exit(0);
  }
  const records = parseJsonl(raw) as Array<Record<string, unknown>>;
  for (let i = 0; i < records.length; i++) {
    const r = records[i]!;
    const meta = (r.meta ?? {}) as Record<string, unknown>;
    if (!CALL_SOURCES.has(String(meta.source ?? ""))) {
      console.error(`line ${i + 1}: unexpected source ${String(meta.source ?? "")}`);
      errors++;
    }
    const tags = Array.isArray(meta.tags) ? meta.tags.map(String) : [];
    if (!tags.some((t) => t.startsWith("source:"))) {
      console.error(`line ${i + 1}: missing source:* tag`);
      errors++;
    }
    const turns = (r.turns ?? []) as Array<{ role: string; content: unknown }>;
    if (turns.length < 2) {
      console.error(`line ${i + 1}: expected >= 2 turns, got ${turns.length}`);
      errors++;
    }
  }
  const judgeRaw = await readFile(judgePath, "utf-8").catch(() => "");
  if (judgeRaw.trim()) {
    const judged = JSON.parse(judgeRaw) as Array<{ sessionId: string; score: number }>;
    const ids = new Set(records.map((r) => String(r.id)));
    for (const j of judged) {
      if (!ids.has(j.sessionId)) {
        console.error(`judge: unknown session ${j.sessionId}`);
        errors++;
      }
      if (typeof j.score !== "number" || j.score < 0 || j.score > 1) {
        console.error(`judge: out-of-range score for ${j.sessionId}`);
        errors++;
      }
    }
    if (judged.length !== records.length) {
      console.error(`judge: ${judged.length} results for ${records.length} sessions`);
      errors++;
    }
  }
  const arenaRaw = await readFile(arenaPath, "utf-8").catch(() => "");
  if (arenaRaw.trim()) {
    const arena = JSON.parse(arenaRaw) as { winner: string | null; blinded: Array<{ label: string }> };
    if (arena.winner && !arena.blinded.some((b) => b.label === arena.winner)) {
      console.error(`arena: winner ${arena.winner} not among blinded labels`);
      errors++;
    }
  }
  console.log(`call-dataset: ${records.length} sessions, ${errors} errors`);
  process.exit(errors ? 1 : 0);
}
main();
