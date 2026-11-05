# Unified Canonical Schema (T1.4)

Source: `packages/session-datasets/src/schema.ts`

## 1. Types

`Session { id, turns: Turn[], meta: SessionMeta }` — unions hermes `state.db` rows, `request_dump` JSON, and the 3 template shapes. `Turn { role, content, reasoning_content?, tool_calls?, tool_call_id?, name? }`, `ToolCall { id, name, canonicalName, arguments, rawArguments }`. `SessionMeta` carries `source`, `tags`, `task_type`, `system_prompt`, `tools_available`, `quality`, plus passthrough `title/project/model/timestamp/chunk_index/total_chunks`.

Tool vocab: 13 canonical (`bash/read/edit/write/grep/glob/lsp/apply_patch/skill/todowrite/webfetch/websearch/task`) + `custom` bucket. Aliases: `exec→bash`, `web_fetch→webfetch`, `gateway/browser→custom` (original name preserved in `ToolCall.name`).

## 2. Adapter Contracts

- `toAgenticMini(session, chunkIndex, totalChunks) → AgenticMiniRecord` — emits Parquet-shaped `{ messages[], metadata }` with `reasoning_content` per turn, `tool_calls` as OpenAI `function.arguments` JSON string, `metadata.session_id/chunk_index/total_chunks/has_*`.
- `toToolCalling(session, idPrefix) → ToolCallingRecord` — emits `{ id, split:"train", tags, messages }` with full tool adjacency, 13-tool normalized names.
- `toSafetyRouting(session, idPrefix) → SafetyRoutingRecord` — emits `{ id, task_type, messages:[system,user], tools_available, target:{assistant,tool_calls,final_response}, quality, metadata }`.

## 3. Adapter Field-Mapping Tables

### Canonical → Agentic-Mini

| Canonical | Agentic-Mini |
|-----------|-------------|
| `session.id` | `metadata.session_id` |
| `turn.role/content` | `messages[].role/content` (empty→null) |
| `turn.tool_calls[].name/rawArguments` | `messages[].tool_calls[].function.name/arguments` |
| `turn.tool_call_id/name` | `messages[].tool_call_id/name` |
| `turn.reasoning_content` | `messages[].reasoning_content` |
| `session.meta.*` | `metadata.*` |

### Canonical → Tool-Calling

| Canonical | Tool-Calling |
|-----------|-------------|
| `session.id` | `id` (`tc_` prefix) |
| `session.meta.tags` | `tags` |
| `turn.*` (system filtered) | `messages[]` |
| `toolCall.canonicalName` (or `name` if custom) | `tool_calls[].function.name` |

### Canonical → Safety/Routing

| Canonical | Safety/Routing |
|-----------|---------------|
| `session.meta.task_type` | `task_type` |
| `session.meta.system_prompt` | `messages[0]` system |
| first user `turn.content` | `messages[1]` user |
| trailing assistant `turn.content` | `target.assistant` + `target.final_response` |
| all `tool_calls` flattened | `target.tool_calls[]` (object args) |
| `session.meta.tools_available` | `tools_available` |
| `session.meta.quality` | `quality` |

## 4. Source → Canonical Mapping

| Source field | Canonical |
|-------------|-----------|
| hermes `state.db` `sessions.id` / `messages.role/content/tool_calls` | `session.id` / `turn.*` (JSON parse `tool_calls`) |
| `request_dump` JSON messages array | `turn.*` |
| `agentic-mini` Parquet row | `turn.*` + `session.meta` |
| `tool-calling` JSONL `tags/messages` | `session.meta.tags` + `turn.*` |
| `dataset` `task_type/tools_available/target` | `session.meta.task_type/tools_available` + `turn.tool_calls` (stringify/parse) |

## 5. Taxonomy Tags

Closed vocab from templates + ecosystem-core spec names. Core: `tool_routing`, `debug_recovery`, `command_execution`, `safety_boundary`, `response_quality`, plus per-tool tags (`bash`, `read`, …), `single_tool`/`multi_tool`, `untrusted`/`error_recovery`, domain tags from `opencode-ecosystem-core` (`legal`, `translation`, `trust`, `transformer`). Extend via `session.meta.tags` free-form; adapters pass through.

## 6. EasyDataset Mapping

Single-turn `Datasets` import: `question←first user content`, `answer←serialized assistant+tool_calls`, `cot←reasoning_content`, `questionLabel←task_type/tags`, `tags←tags`. Multi-turn: `DatasetConversations.rawMessages←JSON(messages)`.
