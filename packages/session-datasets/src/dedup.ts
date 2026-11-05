import { createHash } from "node:crypto";
import type { Session } from "./schema.js";

function normalizeContent(s: string): string {
	return s.replace(/\s+/g, " ").trim().toLowerCase();
}

function stableStringify(v: unknown): string {
	if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "";
	if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`;
	const o = v as Record<string, unknown>;
	return `{${Object.keys(o)
		.sort()
		.map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`)
		.join(",")}}`;
}

export function sessionHash(session: Session): string {
	const parts: string[] = [];
	for (const turn of session.turns) {
		parts.push(`${turn.role}:${normalizeContent(turn.content)}`);
		if (turn.reasoning_content)
			parts.push(`reasoning:${normalizeContent(turn.reasoning_content)}`);
		if (turn.tool_calls?.length) {
			const sorted = [...turn.tool_calls].sort(
				(a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
			);
			for (const tc of sorted) {
				parts.push(`tool:${tc.name}:${stableStringify(tc.arguments)}`);
			}
		}
		if (turn.tool_call_id) parts.push(`tool_call_id:${turn.tool_call_id}`);
	}
	return createHash("sha256").update(parts.join("\n")).digest("hex");
}

export function dedup<T extends Session>(
	sessions: T[],
): { unique: T[]; duplicates: number } {
	const seen = new Set<string>();
	const unique: T[] = [];
	let duplicates = 0;
	for (const s of sessions) {
		const h = sessionHash(s as Session);
		if (seen.has(h)) duplicates++;
		else {
			seen.add(h);
			unique.push(s);
		}
	}
	return { unique, duplicates };
}
