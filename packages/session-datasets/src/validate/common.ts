export interface ValidationIssue {
  line: number;
  field: string;
  message: string;
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function parseJsonl(content: string): unknown[] {
  return content.trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
}

export function checkToolCallIdLinkage(messages: Array<{ role: string; tool_calls?: Array<{ id: string }>; tool_call_id?: string }>): string[] {
  const ids = new Set<string>();
  for (const m of messages) for (const tc of m.tool_calls ?? []) ids.add(tc.id);
  const errs: string[] = [];
  for (const m of messages) if (m.role === "tool" && m.tool_call_id && !ids.has(m.tool_call_id)) errs.push(`orphan tool_call_id ${m.tool_call_id}`);
  return errs;
}
