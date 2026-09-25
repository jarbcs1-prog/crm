import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Session } from "../schema.js";

export interface EasyDatasetRecord {
  question: string;
  answer: string;
  cot: string;
  chunkName: string;
  chunkContent: string;
  model: string;
  questionLabel: string;
  tags: string;
  confirmed: boolean;
  score: number;
  note: string;
  other: string;
}

export interface EasyDatasetConversation {
  question: string;
  scenario: string;
  roleA: string;
  roleB: string;
  turnCount: number;
  maxTurns: number;
  rawMessages: string;
  questionLabel: string;
  model: string;
  confirmed: boolean;
  score: number;
  tags: string;
  note: string;
}

export interface EasyDatasetImportBundle {
  datasets: EasyDatasetRecord[];
}

export interface EasyDatasetConversationBundle {
  conversations: EasyDatasetConversation[];
}

export interface ManifestFieldMapping {
  canonicalField: string;
  easyDatasetColumn: string;
  required: boolean;
  transform: string;
}

export const MANIFEST: ManifestFieldMapping[] = [
  { canonicalField: "turns[].content (user first)", easyDatasetColumn: "question", required: true, transform: "first user turn content, trimmed" },
  { canonicalField: "turns[].content (assistant last)", easyDatasetColumn: "answer", required: true, transform: "last assistant content or serialized tool_calls" },
  { canonicalField: "turns[].reasoning_content", easyDatasetColumn: "cot", required: false, transform: "concatenated reasoning_content joined by \\n\\n" },
  { canonicalField: "meta.title / session.id", easyDatasetColumn: "chunkName", required: false, transform: "meta.title ?? session.id" },
  { canonicalField: "turns[].content (all)", easyDatasetColumn: "chunkContent", required: false, transform: "truncated concatenation of all turn contents (max 2000 chars)" },
  { canonicalField: "meta.model", easyDatasetColumn: "model", required: false, transform: "meta.model ?? 'imported'" },
  { canonicalField: "meta.task_type / tags[0]", easyDatasetColumn: "questionLabel", required: false, transform: "meta.task_type ?? tags[0] ?? ''" },
  { canonicalField: "meta.tags", easyDatasetColumn: "tags", required: false, transform: "JSON.stringify(tags)" },
  { canonicalField: "confirmed", easyDatasetColumn: "confirmed", required: false, transform: "true (pre-validated)" },
  { canonicalField: "score", easyDatasetColumn: "score", required: false, transform: "1.0 default" },
  { canonicalField: "meta.extra.note", easyDatasetColumn: "note", required: false, transform: "meta.extra.note ?? ''" },
  { canonicalField: "meta", easyDatasetColumn: "other", required: false, transform: "JSON.stringify({source, session_id, chunk_index})" },
  { canonicalField: "turns[] (full)", easyDatasetColumn: "rawMessages (DatasetConversations)", required: false, transform: "JSON.stringify ShareGPT messages for multi-turn" },
  { canonicalField: "turns.length", easyDatasetColumn: "turnCount/maxTurns (DatasetConversations)", required: false, transform: "turnCount = turns.length, maxTurns = turnCount" },
];

function extractCot(session: Session): string {
  const parts = session.turns.map((t) => t.reasoning_content).filter((v): v is string => !!v);
  return parts.join("\n\n");
}

function extractQuestion(session: Session): string {
  const first = session.turns.find((t) => t.role === "user");
  return (first?.content ?? session.turns[0]?.content ?? "").trim();
}

function extractAnswer(session: Session): string {
  const assistants = session.turns.filter((t) => t.role === "assistant");
  const last = assistants[assistants.length - 1];
  if (!last) return "";
  if (last.content?.trim()) return last.content.trim();
  if (last.tool_calls?.length) return JSON.stringify(last.tool_calls.map((tc) => ({ name: tc.name, arguments: tc.arguments })));
  return "";
}

function chunkContent(session: Session): string {
  const combined = session.turns.map((t) => `[${t.role}] ${t.content}`).join("\n");
  return combined.length > 2000 ? combined.slice(0, 2000) + "…[truncated]" : combined;
}

export function sessionToEasyDatasetRecord(session: Session): EasyDatasetRecord | null {
  const question = extractQuestion(session);
  const answer = extractAnswer(session);
  if (!question || !answer) return null;
  return {
    question,
    answer,
    cot: extractCot(session),
    chunkName: session.meta.title ?? session.id,
    chunkContent: chunkContent(session),
    model: session.meta.model ?? "imported",
    questionLabel: session.meta.task_type ?? session.meta.tags[0] ?? "",
    tags: JSON.stringify(session.meta.tags),
    confirmed: true,
    score: 1.0,
    note: "",
    other: JSON.stringify({ source: session.meta.source, session_id: session.id, has_tool_use: session.meta.has_tool_use, has_reasoning: session.meta.has_reasoning }),
  };
}

export function sessionToConversation(session: Session): EasyDatasetConversation | null {
  const question = extractQuestion(session);
  if (!question) return null;
  const rawMessages = session.turns.map((t) => {
    const msg: Record<string, unknown> = { role: t.role, content: t.content };
    if (t.tool_calls?.length) msg.tool_calls = t.tool_calls.map((tc) => ({ id: tc.id, type: "function", function: { name: tc.name, arguments: tc.rawArguments } }));
    if (t.tool_call_id) msg.tool_call_id = t.tool_call_id;
    if (t.name) msg.name = t.name;
    return msg;
  });
  return {
    question,
    scenario: session.meta.task_type ?? "general",
    roleA: "User",
    roleB: "Assistant",
    turnCount: session.turns.length,
    maxTurns: session.turns.length,
    rawMessages: JSON.stringify(rawMessages),
    questionLabel: session.meta.task_type ?? session.meta.tags[0] ?? "",
    model: session.meta.model ?? "imported",
    confirmed: true,
    score: 1.0,
    tags: JSON.stringify(session.meta.tags),
    note: "",
  };
}

export function buildBundles(sessions: Session[]): { datasets: EasyDatasetImportBundle; conversations: EasyDatasetConversationBundle } {
  const datasets: EasyDatasetRecord[] = [];
  const conversations: EasyDatasetConversation[] = [];
  for (const s of sessions) {
    const rec = sessionToEasyDatasetRecord(s);
    if (rec) datasets.push(rec);
    const hasMultiTurn = s.turns.length > 2 || s.turns.some((t) => !!t.tool_calls?.length);
    if (hasMultiTurn) {
      const conv = sessionToConversation(s);
      if (conv) conversations.push(conv);
    }
  }
  return { datasets: { datasets }, conversations: { conversations } };
}

export function writeBundles(sessions: Session[], outDir: string): void {
  mkdirSync(outDir, { recursive: true });
  const { datasets, conversations } = buildBundles(sessions);
  writeFileSync(join(outDir, "easydataset-import.json"), JSON.stringify(datasets, null, 2), "utf-8");
  writeFileSync(join(outDir, "easydataset-conversations.json"), JSON.stringify(conversations, null, 2), "utf-8");
  writeFileSync(join(outDir, "manifest.json"), JSON.stringify({ mapping: MANIFEST, counts: { datasets: datasets.datasets.length, conversations: conversations.conversations.length } }, null, 2), "utf-8");
}

export function writeToSqlite(sessions: Session[], dbPath: string, projectId: string): void {
  const { default: Database } = require("better-sqlite3") as unknown as { default: typeof import("better-sqlite3") };
  const db = new (Database as unknown as new (p: string) => import("better-sqlite3").Database)(dbPath);
  const { datasets } = buildBundles(sessions);
  const stmt = db.prepare(
    `INSERT INTO Datasets (id, projectId, question, answer, cot, chunkName, chunkContent, model, questionLabel, tags, confirmed, score, note, other, createAt, updateAt)
     VALUES (@id, @projectId, @question, @answer, @cot, @chunkName, @chunkContent, @model, @questionLabel, @tags, @confirmed, @score, @note, @other, @createAt, @updateAt)`
  );
  const { nanoid } = require("nanoid") as { nanoid: () => string };
  const now = new Date().toISOString();
  const insertMany = db.transaction((records: EasyDatasetRecord[]) => {
    for (const r of records) {
      stmt.run({
        id: nanoid(),
        projectId,
        question: r.question,
        answer: r.answer,
        cot: r.cot,
        chunkName: r.chunkName,
        chunkContent: r.chunkContent,
        model: r.model,
        questionLabel: r.questionLabel,
        tags: r.tags,
        confirmed: r.confirmed ? 1 : 0,
        score: r.score,
        note: r.note,
        other: r.other,
        createAt: now,
        updateAt: now,
      });
    }
  });
  insertMany(datasets.datasets);
  db.close();
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
  const input = args["input"];
  const out = args["out"] ?? "data/easydataset";
  const sqlitePath = args["sqlite"];
  const projectId = args["projectId"] ?? "imported";
  if (!input) {
    console.error("Usage: bun run src/export/easyDataset.ts --input <canonical.jsonl> --out <dir> [--sqlite <db.sqlite> --projectId <id>]");
    process.exit(1);
  }
  if (!existsSync(input)) {
    console.error(`Input not found: ${input}`);
    process.exit(1);
  }
  const lines = readFileSync(input, "utf-8").split("\n").filter(Boolean);
  const sessions: Session[] = lines.map((l) => JSON.parse(l) as Session);
  writeBundles(sessions, out);
  console.log(`Wrote ${sessions.length} sessions -> ${out}/easydataset-import.json + conversations + manifest`);
  if (sqlitePath) {
    writeToSqlite(sessions, sqlitePath, projectId);
    console.log(`Inserted into SQLite: ${sqlitePath} [projectId=${projectId}]`);
  }
}
