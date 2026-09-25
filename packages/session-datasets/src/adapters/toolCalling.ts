import * as fs from "node:fs";
import * as path from "node:path";
import { canonicalizeToolName, type Session, type ToolCallingRecord, toToolCalling } from "../schema.js";

export function sessionToToolCallingRecords(session: Session, idPrefix = "tc"): ToolCallingRecord[] {
  const toolTurnIndices: number[] = [];
  session.turns.forEach((t, i) => {
    if (t.tool_calls?.length) toolTurnIndices.push(i);
  });
  if (toolTurnIndices.length === 0) return [];
  return toolTurnIndices.map((idx, n) => {
    const userTurn = [...session.turns.slice(0, idx)].reverse().find((t) => t.role === "user");
    const assistantTurn = session.turns[idx]!;
    const toolResults = session.turns.filter((t) => t.role === "tool" && assistantTurn.tool_calls?.some((tc) => tc.id === t.tool_call_id));
    const messages: ToolCallingRecord["messages"] = [];
    if (userTurn) messages.push({ role: "user", content: userTurn.content });
    messages.push({
      role: "assistant",
      content: assistantTurn.content,
      tool_calls: (assistantTurn.tool_calls ?? []).map((tc) => ({
        id: tc.id,
        type: "function" as const,
        function: { name: canonicalizeToolName(tc.name) === "custom" ? tc.name : canonicalizeToolName(tc.name), arguments: tc.rawArguments },
      })),
    });
    for (const tr of toolResults) {
      messages.push({ role: "tool", content: tr.content, tool_call_id: tr.tool_call_id, name: tr.name });
    }
    const base = toToolCalling(session, idPrefix);
    return {
      id: `${base.id}_${String(n).padStart(4, "0")}`,
      split: base.split,
      tags: [...session.meta.tags, ...(assistantTurn.tool_calls ?? []).map((tc) => canonicalizeToolName(tc.name)), assistantTurn.tool_calls && assistantTurn.tool_calls.length > 1 ? "multi_tool" : "single_tool"],
      messages,
    };
  });
}

export function convertSessions(sessions: Session[]): ToolCallingRecord[] {
  return sessions.flatMap((s) => sessionToToolCallingRecords(s));
}

export async function buildToolCalling(inputPath: string, outPath: string): Promise<void> {
  const raw = await fs.promises.readFile(inputPath, "utf-8");
  const sessions: Session[] = raw.trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const records = convertSessions(sessions);
  await fs.promises.mkdir(path.dirname(outPath), { recursive: true });
  await fs.promises.writeFile(outPath, records.map((r) => JSON.stringify(r)).join("\n") + (records.length ? "\n" : ""));
}

const args = process.argv.slice(2);
if (args.length >= 2 && args[0] === "--input") {
  const inputIdx = args.indexOf("--input");
  const outIdx = args.indexOf("--out");
  buildToolCalling(args[inputIdx + 1]!, outIdx !== -1 ? args[outIdx + 1]! : "data/tool-calling.jsonl").catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
