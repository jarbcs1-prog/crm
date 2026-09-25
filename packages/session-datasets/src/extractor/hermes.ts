import Database from "better-sqlite3";
import {
	canonicalizeToolName,
	type Session,
	type ToolCall,
	type Turn,
} from "../schema.js";

export interface ExtractorOptions {
	dbPath?: string;
	truncateAt?: number;
	minTurns?: number;
	maxSessions?: number;
	includeHidden?: boolean;
}

export interface ExtractStats {
	sessionsRead: number;
	sessionsEmitted: number;
	errors: number;
}

function parseToolCalls(raw: string | null): ToolCall[] | undefined {
	if (!raw) return undefined;
	try {
		const arr = JSON.parse(raw);
		if (!Array.isArray(arr) || arr.length === 0) return undefined;
		return arr.map((tc: Record<string, unknown>, i: number) => {
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
	} catch {
		return undefined;
	}
}

function normalizeRole(role: string): Turn["role"] {
	if (
		role === "user" ||
		role === "assistant" ||
		role === "tool" ||
		role === "system"
	)
		return role;
	if (role === "developer") return "system";
	return "user";
}

export function extractHermesDb(options: ExtractorOptions = {}): {
	sessions: Session[];
	stats: ExtractStats;
} {
	const dbPath =
		options.dbPath ??
		process.env.HERMES_STATE_DB ??
		`${process.env.LOCALAPPDATA ?? ""}\\hermes\\state.db`;
	const truncateAt = options.truncateAt ?? 8000;
	const minTurns = options.minTurns ?? 1;
	const stats: ExtractStats = {
		sessionsRead: 0,
		sessionsEmitted: 0,
		errors: 0,
	};
	const sessions: Session[] = [];
	let db: InstanceType<typeof Database>;
	try {
		db = new Database(dbPath, { readonly: true });
	} catch (e) {
		throw new Error(`Cannot open hermes state.db at ${dbPath}: ${e}`);
	}
	try {
		const hiddenFilter = options.includeHidden
			? ""
			: "WHERE s.hidden=0 AND s.archived=0";
		const rows = db
			.prepare(
				`SELECT s.* FROM sessions s ${hiddenFilter} ORDER BY s.started_at`,
			)
			.all() as Record<string, unknown>[];
		stats.sessionsRead = rows.length;
		const limit = options.maxSessions;
		const msgStmt = db.prepare(
			"SELECT * FROM messages WHERE session_id=? AND active=1 ORDER BY timestamp, id",
		);
		for (const s of rows) {
			if (limit && sessions.length >= limit) break;
			try {
				const sid = String(s.id);
				const msgRows = msgStmt.all(sid) as Record<string, unknown>[];
				const turns: Turn[] = [];
				for (const m of msgRows) {
					let content =
						(m.content as string | null) ??
						(m.api_content as string | null) ??
						"";
					if (truncateAt && content.length > truncateAt)
						content = content.slice(0, truncateAt) + "\n[truncated]";
					const reasoningContent =
						(m.reasoning_content as string | null) ??
						(m.reasoning as string | null) ??
						undefined;
					const tool_calls = parseToolCalls(m.tool_calls as string | null);
					const role = normalizeRole(String(m.role));
					if (role === "tool") {
						turns.push({
							role: "tool",
							content,
							tool_call_id: (m.tool_call_id as string) ?? undefined,
							name: (m.tool_name as string) ?? undefined,
						});
					} else {
						const turn: Turn = { role, content };
						if (reasoningContent)
							turn.reasoning_content =
								truncateAt && reasoningContent.length > truncateAt
									? reasoningContent.slice(0, truncateAt) + "\n[truncated]"
									: reasoningContent;
						if (tool_calls) turn.tool_calls = tool_calls;
						if (m.tool_call_id) turn.tool_call_id = m.tool_call_id as string;
						if (m.tool_name) turn.name = m.tool_name as string;
						turns.push(turn);
					}
				}
				if (turns.length < minTurns) continue;
				const hasTool = turns.some((t) => t.tool_calls?.length);
				const hasReasoning = turns.some((t) => !!t.reasoning_content);
				let tags: string[] = [];
				try {
					const tn = s.tool_names as string | null;
					if (tn) {
						const a = JSON.parse(tn);
						if (Array.isArray(a)) tags = a;
					}
				} catch {
					/* ignore */
				}
				sessions.push({
					id: sid,
					turns,
					meta: {
						title: (s.title as string) ?? undefined,
						model: (s.model as string) ?? undefined,
						timestamp: s.started_at as number | undefined,
						source: "hermes-state-db",
						system_prompt: (s.system_prompt as string) ?? undefined,
						tags,
						has_tool_use: hasTool,
						has_reasoning: hasReasoning,
						extra: {
							cwd: s.cwd,
							source_field: s.source,
							chat_type: s.chat_type,
							git_branch: s.git_branch,
						},
					},
				});
				stats.sessionsEmitted++;
			} catch {
				stats.errors++;
			}
		}
	} finally {
		db.close();
	}
	return { sessions, stats };
}
