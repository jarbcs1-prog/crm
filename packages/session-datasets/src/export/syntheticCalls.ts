import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { dedup } from "../dedup.js";
import { scrubSession } from "../pii.js";
import type { Session } from "../schema.js";

export interface SyntheticPersona {
  id: string;
  script: string[];
  defaultReply: string;
}

export interface SyntheticPitchSegment {
  pitch: string;
  id: string;
  text: string;
}

export function loadPersonas(path: string): SyntheticPersona[] {
  const raw = JSON.parse(readFileSync(path, "utf-8") as string) as unknown;
  const list = Array.isArray(raw) ? raw : (raw as { personas?: unknown }).personas;
  if (!Array.isArray(list)) return [];
  const out: SyntheticPersona[] = [];
  for (const entry of list) {
    const rec = entry as Record<string, unknown>;
    if (typeof rec.id !== "string" || !rec.id) continue;
    const script = Array.isArray(rec.script) ? rec.script.filter((s): s is string => typeof s === "string") : [];
    out.push({
      id: rec.id,
      script,
      defaultReply: typeof rec.defaultReply === "string" && rec.defaultReply ? rec.defaultReply : "Go on.",
    });
  }
  return out;
}

export function loadPitchSegments(dir: string): SyntheticPitchSegment[] {
  let names: string[];
  try {
    names = readdirSync(dir).filter((n) => n.toLowerCase().endsWith(".json")).sort();
  } catch {
    return [];
  }
  const out: SyntheticPitchSegment[] = [];
  for (const name of names) {
    const stem = basename(name, ".json");
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(join(dir, name), "utf-8") as string) as unknown;
    } catch {
      continue;
    }
    const rec = parsed as Record<string, unknown>;
    const segments = Array.isArray(rec.segments) ? rec.segments : [];
    for (const entry of segments) {
      const seg = entry as Record<string, unknown>;
      if (typeof seg.text !== "string" || !seg.text.trim()) continue;
      out.push({
        pitch: stem,
        id: typeof seg.id === "string" && seg.id ? seg.id : `segment-${out.length + 1}`,
        text: seg.text,
      });
    }
  }
  return out;
}

export function synthesizeSession(pitch: string, segments: SyntheticPitchSegment[], persona: SyntheticPersona): Session {
  const turns: Session["turns"] = [];
  const pairs = Math.max(1, segments.length);
  for (let i = 0; i < pairs; i++) {
    const seg = segments[i % segments.length];
    if (seg) turns.push({ role: "assistant", content: seg.text });
    turns.push({ role: "user", content: persona.script[i] ?? persona.defaultReply });
  }
  turns.push({ role: "assistant", content: "Thank you for your time. Goodbye." });
  const hash = createHash("sha256").update(`${pitch}:${persona.id}`).digest("hex").slice(0, 12);
  return {
    id: `synthetic-${pitch}-${persona.id}-${hash}`,
    turns,
    meta: {
      source: "synthetic-call",
      task_type: "synthetic-call",
      tags: [`source:synthetic-${persona.id}`, `pitch:${pitch}`],
      tools_available: [],
      has_tool_use: false,
      has_reasoning: false,
      extra: { pitch, persona: persona.id },
    },
  };
}

export interface SyntheticOutputs {
  sessions: Session[];
  duplicates: number;
  redacted: number;
}

export function buildSyntheticCalls(personas: SyntheticPersona[], segments: SyntheticPitchSegment[]): SyntheticOutputs {
  const byPitch = new Map<string, SyntheticPitchSegment[]>();
  for (const seg of segments) {
    const list = byPitch.get(seg.pitch) ?? [];
    list.push(seg);
    byPitch.set(seg.pitch, list);
  }
  const all: Session[] = [];
  for (const [pitch, segs] of byPitch) {
    for (const persona of personas) all.push(synthesizeSession(pitch, segs, persona));
  }
  const { unique, duplicates } = dedup(all);
  let redacted = 0;
  const clean: Session[] = [];
  for (const s of unique) {
    const res = scrubSession(s, {});
    if (res) {
      if (res.redacted) redacted++;
      clean.push(res.session);
    }
  }
  return { sessions: clean, duplicates, redacted };
}

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const val = argv[i + 1] && !argv[i + 1]!.startsWith("--") ? argv[++i]! : "true";
      out[key] = val;
    }
  }
  return out;
}

const isMain = resolve(process.argv[1] ?? "") === resolve(new URL(import.meta.url).pathname.replace(/^\//, "").replace(/^([A-Z]):\//, "$1:/"));

if (isMain) {
  const args = parseArgs(process.argv.slice(2));
  const personasPath = args["personas"];
  const pitchesDir = args["pitches"];
  const out = args["out"] ?? "data/synthetic-canonical.jsonl";
  if (!personasPath || !pitchesDir) {
    console.error("Usage: bun run src/export/syntheticCalls.ts --personas <call-personas.json> --pitches <pitches dir> --out <canonical.jsonl>");
    process.exit(1);
  }
  const outputs = buildSyntheticCalls(loadPersonas(personasPath), loadPitchSegments(pitchesDir));
  writeFileSync(out, outputs.sessions.map((s) => JSON.stringify(s)).join("\n") + (outputs.sessions.length ? "\n" : ""), "utf-8");
  console.log(`synthetic: ${outputs.sessions.length} sessions, ${outputs.duplicates} duplicates, ${outputs.redacted} redacted -> ${out}`);
}
