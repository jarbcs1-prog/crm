export const TOOL_VOCAB = [
	"bash",
	"read",
	"edit",
	"write",
	"grep",
	"glob",
	"lsp",
	"apply_patch",
	"skill",
	"todowrite",
	"webfetch",
	"websearch",
	"task",
] as const;

export type CanonicalToolName = (typeof TOOL_VOCAB)[number] | "custom";

export type TurnRole = "user" | "assistant" | "tool" | "system";

export interface ToolCall {
	id: string;
	name: string;
	canonicalName: CanonicalToolName;
	arguments: Record<string, unknown>;
	rawArguments: string;
}

export interface Turn {
	role: TurnRole;
	content: string;
	reasoning_content?: string;
	tool_calls?: ToolCall[];
	tool_call_id?: string;
	name?: string;
}

export type SessionSource =
	| "hermes-state-db"
	| "request-dump"
	| "opencode-agentic-mini"
	| "opencode-dataset"
	| "opencode-tool-calling"
	| "imported"
	| "call-transcript"
	| "synthetic-call";

export interface SessionMeta {
	title?: string;
	project?: string;
	directory?: string;
	model?: string;
	timestamp?: number;
	source: SessionSource;
	system_prompt?: string;
	task_type?: string;
	tags: string[];
	tools_available?: string[];
	has_tool_use?: boolean;
	has_reasoning?: boolean;
	chunk_index?: number;
	total_chunks?: number;
	quality?: {
		safety_ok?: boolean;
		tool_choice_ok?: boolean;
		command_validity_ok?: boolean;
	};
	extra?: Record<string, unknown>;
}

export interface Session {
	id: string;
	turns: Turn[];
	meta: SessionMeta;
}

export interface AgenticMiniRecord {
	messages: Array<{
		role: TurnRole;
		content: string | null;
		tool_calls?: Array<{
			id: string;
			type: "function";
			function: { name: string; arguments: string };
		}>;
		tool_call_id?: string;
		name?: string;
		reasoning_content?: string | null;
	}>;
	metadata: {
		session_id: string;
		title?: string | null;
		project?: string | null;
		directory?: string | null;
		model?: string | null;
		timestamp?: number | null;
		num_turns?: number;
		has_tool_use?: boolean;
		has_reasoning?: boolean;
		chunk_index?: number;
		total_chunks?: number;
	};
}

export interface ToolCallingRecord {
	id: string;
	split: "train" | "eval";
	tags: string[];
	messages: Array<{
		role: TurnRole;
		content: string;
		tool_calls?: Array<{
			id: string;
			type: "function";
			function: { name: string; arguments: string };
		}>;
		tool_call_id?: string;
		name?: string;
	}>;
}

export interface SafetyRoutingRecord {
	id: string;
	task_type: string;
	messages: Array<{ role: "system" | "user"; content: string }>;
	tools_available: string[];
	target: {
		assistant: string;
		tool_calls: Array<{ name: string; arguments: Record<string, unknown> }>;
		final_response: string;
	};
	quality?: {
		safety_ok: boolean;
		tool_choice_ok: boolean;
		command_validity_ok: boolean;
	};
	metadata?: Record<string, unknown>;
}

const TOOL_ALIASES: Record<string, CanonicalToolName> = {
	exec: "bash",
	terminal: "bash",
	bash: "bash",
	read_file: "read",
	search_files: "grep",
	patch: "apply_patch",
	skill_view: "skill",
	sessions_send: "task",
	task: "task",
	web_fetch: "webfetch",
	web_search: "websearch",
	write: "write",
	edit: "edit",
	read: "read",
	grep: "grep",
	glob: "glob",
	gateway: "custom",
	browser: "custom",
};

export function canonicalizeToolName(name: string): CanonicalToolName {
	if ((TOOL_VOCAB as unknown as string[]).includes(name))
		return name as CanonicalToolName;
	if (name in TOOL_ALIASES) return TOOL_ALIASES[name] as CanonicalToolName;
	return "custom";
}

export function toAgenticMini(
	session: Session,
	chunkIndex = 0,
	totalChunks = 1,
): AgenticMiniRecord {
	const ids = new Set(
		session.turns
			.filter((t) => t.tool_calls?.length)
			.flatMap((t) => t.tool_calls!.map((c) => c.id)),
	);
	const turns = session.turns.filter(
		(t) => !(t.role === "tool" && !ids.has(t.tool_call_id ?? "")),
	);
	return {
		messages: turns.map((t) => ({
			role: t.role,
			content: t.content || null,
			...(t.tool_calls?.length
				? {
						tool_calls: t.tool_calls.map((tc) => ({
							id: tc.id,
							type: "function" as const,
							function: { name: tc.name, arguments: tc.rawArguments },
						})),
					}
				: {}),
			...(t.tool_call_id ? { tool_call_id: t.tool_call_id } : {}),
			...(t.name ? { name: t.name } : {}),
			...(t.reasoning_content
				? { reasoning_content: t.reasoning_content }
				: {}),
		})),
		metadata: {
			session_id: session.id,
			title: session.meta.title ?? null,
			project: session.meta.project ?? null,
			directory: session.meta.directory ?? null,
			model: session.meta.model ?? null,
			timestamp: session.meta.timestamp ?? null,
			num_turns: session.turns.filter((t) => t.role === "assistant").length,
			has_tool_use: session.turns.some((t) => !!t.tool_calls?.length),
			has_reasoning: session.turns.some((t) => !!t.reasoning_content),
			chunk_index: chunkIndex,
			total_chunks: totalChunks,
		},
	};
}

export function toToolCalling(
	session: Session,
	idPrefix = "tc",
): ToolCallingRecord {
	return {
		id: `${idPrefix}_${session.id}`,
		split: "train",
		tags: session.meta.tags,
		messages: session.turns
			.filter((t) => t.role !== "system")
			.map((t) => ({
				role: t.role,
				content: t.content,
				...(t.tool_calls?.length
					? {
							tool_calls: t.tool_calls.map((tc) => ({
								id: tc.id,
								type: "function" as const,
								function: {
									name:
										tc.canonicalName === "custom" ? tc.name : tc.canonicalName,
									arguments: tc.rawArguments,
								},
							})),
						}
					: {}),
				...(t.tool_call_id ? { tool_call_id: t.tool_call_id } : {}),
				...(t.name ? { name: t.name } : {}),
			})),
	};
}

export function toSafetyRouting(
	session: Session,
	idPrefix = "ds",
): SafetyRoutingRecord {
	const userTurns = session.turns.filter((t) => t.role === "user");
	const assistantTurns = session.turns.filter((t) => t.role === "assistant");
	const lastAssistant = assistantTurns[assistantTurns.length - 1];
	const toolCalls = session.turns.flatMap((t) => t.tool_calls ?? []);
	return {
		id: `${idPrefix}_${session.id}`,
		task_type: session.meta.task_type ?? "tool_routing",
		messages: [
			{
				role: "system",
				content:
					session.meta.system_prompt ?? "You are Clawd, an AI assistant.",
			},
			{ role: "user", content: userTurns[0]?.content ?? "" },
		],
		tools_available: session.meta.tools_available ?? [...TOOL_VOCAB],
		target: {
			assistant: lastAssistant?.content ?? "Acknowledged. Proceeding.",
			tool_calls: toolCalls.map((tc) => ({
				name: tc.name,
				arguments: tc.arguments,
			})),
			final_response: lastAssistant?.content ?? "",
		},
		...(session.meta.quality
			? { quality: session.meta.quality as SafetyRoutingRecord["quality"] }
			: {}),
		metadata: { source: session.meta.source, tags: session.meta.tags },
	};
}
