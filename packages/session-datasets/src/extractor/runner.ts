import { createWriteStream, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { Session } from "../schema.js";
import { type ExtractorOptions, extractHermesDb } from "./hermes.js";
import { extractRequestDumps } from "./requestDump.js";

export interface RunnerOptions extends ExtractorOptions {
  out?: string;
  includeRequestDumps?: boolean;
  requestDumpDir?: string;
}

export function runExtraction(opts: RunnerOptions = {}): { sessions: Session[]; outPath?: string } {
  const hermes = extractHermesDb(opts);
  let sessions = hermes.sessions;
  if (opts.includeRequestDumps) {
    const extra = extractRequestDumps(opts.requestDumpDir, opts);
    const seen = new Set(sessions.map((s) => s.id));
    for (const s of extra) if (!seen.has(s.id)) sessions.push(s);
  }
  if (opts.out) {
    const outPath = resolve(opts.out);
    mkdirSync(dirname(outPath), { recursive: true });
    const ws = createWriteStream(outPath, "utf-8");
    for (const s of sessions) ws.write(JSON.stringify(s) + "\n");
    ws.end();
    return { sessions, outPath };
  }
  return { sessions };
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const get = (k: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
  const out = get("--out") ?? get("--output") ?? "data/canonical.jsonl";
  const input = get("--input");
  const opts: RunnerOptions = { out, dbPath: input, includeRequestDumps: args.includes("--request-dumps"), truncateAt: get("--truncate") ? Number(get("--truncate")) : undefined };
  const { sessions } = runExtraction(opts);
  console.log(`Extracted ${sessions.length} sessions -> ${out}`);
}
