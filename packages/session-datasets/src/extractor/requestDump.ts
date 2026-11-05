import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { canonicalizeToolName, type Session, type Turn } from "../schema.js";
import type { ExtractorOptions } from "./hermes.js";

export function extractRequestDumps(
	dir?: string,
	options: ExtractorOptions = {},
): Session[] {
	const d = dir ?? `${process.env.LOCALAPPDATA ?? ""}\\hermes\\sessions`;
	if (!existsSync(d)) return [];
	const files = readdirSync(d).filter(
		(f) => f.startsWith("request_dump") && f.endsWith(".json"),
	);
	const out: Session[] = [];
	const truncateAt = options.truncateAt ?? 8000;
	for (const f of files) {
		try {
			const raw = JSON.parse(readFileSync(join(d, f), "utf-8"));
			const msgs =
				raw.messages ?? raw.request?.messages ?? raw.data?.messages ?? [];
			if (!Array.isArray(msgs) || msgs.length === 0) continue;
			const turns: Turn[] = msgs.map((m: Record<string, unknown>) => {
				let content = "";
				const c = m.content;
				if (typeof c === "string") content = c;
				else if (Array.isArray(c))
					content = (c as Record<string, unknown>[])
						.map((x) => String(x.text ?? x.content ?? ""))
						.join("\n");
				else if (c) content = JSON.stringify(c);
				if (truncateAt && content.length > truncateAt)
					content = content.slice(0, truncateAt) + "\n[truncated]";
				const tcRaw = m.tool_calls as Record<string, unknown>[] | undefined;
				const tool_calls = tcRaw?.map((tc, i) => {
					const fn = (tc.function ?? tc) as Record<string, unknown>;
					const name = String(fn.name ?? tc.name ?? "unknown");
					const rawArgs =
						typeof fn.arguments === "string"
							? (fn.arguments as string)
							: JSON.stringify(fn.arguments ?? {});
					let args: Record<string, unknown> = {};
					try {
						const p = JSON.parse(rawArgs);
						if (p && typeof p === "object") args = p as Record<string, unknown>;
					} catch {
						/* keep raw */
					}
					return {
						id: String(tc.id ?? `tc_${i}`),
						name,
						canonicalName: canonicalizeToolName(name),
						arguments: args,
						rawArguments: rawArgs,
					};
				});
				const rc = (m.reasoning_content ?? m.reasoning) as string | undefined;
				const turn: Turn = {
					role: (m.role as Turn["role"]) ?? "user",
					content,
				};
				if (rc)
					turn.reasoning_content =
						rc.length > truncateAt
							? rc.slice(0, truncateAt) + "\n[truncated]"
							: rc;
				if (tool_calls?.length) turn.tool_calls = tool_calls;
				if (m.tool_call_id) turn.tool_call_id = m.tool_call_id as string;
				if (m.name) turn.name = m.name as string;
				return turn;
			});
			const sid = raw.session_id ?? raw.sessionId ?? f.replace(/\.json$/, "");
			out.push({
				id: String(sid),
				turns,
				meta: {
					source: "request-dump",
					tags: [],
					has_tool_use: turns.some((t) => !!t.tool_calls?.length),
					has_reasoning: turns.some((t) => !!t.reasoning_content),
				},
			});
		} catch {
			/* skip malformed */
		}
	}
	return out;
}
