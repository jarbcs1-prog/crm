# Reference Template Schemas (T1.3) — 2026-09-22

Source templates: `%USERPROFILE%\.config\opencode\opencode-{agentic-mini,dataset,tool-calling,ecosystem-core}`

## 1. opencode-agentic-mini — Parquet, multi-turn agentic sessions

- **Path:** `opencode-agentic-mini/data/train-*.parquet` (6,875 rows), `validation-*.parquet` (389), total per README 18,549 train + 1,001 val from 507 sessions.
- **Format:** Parquet with `messages: List[Message]` + `metadata: Struct`.
- **Schema (from `pyarrow.parquet.ParquetFile.schema` + README front-matter):**

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `messages` | `list<struct>` | yes | Each element is a Message |
| `messages[].role` | `string` enum `user|assistant|tool|system` | yes | |
| `messages[].content` | `string` nullable | no | `null` when assistant is tool-call-only |
| `messages[].tool_call_id` | `string` nullable | cond | Set on `tool` role, links to `assistant.tool_calls[].id` |
| `messages[].tool_calls` | `list<struct>` nullable | no | OpenAI-style |
| `messages[].tool_calls[].id` | `string` | yes | e.g. `call_function_...` |
| `messages[].tool_calls[].type` | `string` | yes | always `function` |
| `messages[].tool_calls[].function.name` | `string` | yes | 13-tool vocab + `bash` alias |
| `messages[].tool_calls[].function.arguments` | `string` (JSON) | yes | JSON-stringified args |
| `messages[].reasoning_content` | `string` nullable | no | CoT; present when `metadata.has_reasoning` |
| `metadata.session_id` | `string` | yes | `ses_...` |
| `metadata.title` | `string` nullable | no | session title |
| `metadata.project` | `string` nullable | no | opencode project hash |
| `metadata.directory` | `string` nullable | no | working dir |
| `metadata.model` | `string` nullable | no | `minimax-m3-free` etc. |
| `metadata.timestamp` | `int64` | no | epoch ms |
| `metadata.num_turns` | `int64` | no | assistant turns in chunk |
| `metadata.has_tool_use` | `bool` | no | |
| `metadata.has_reasoning` | `bool` | no | |
| `metadata.chunk_index` | `int64` | no | 0-based |
| `metadata.total_chunks` | `int64` | no | chunks for this session |

- **Chunking:** ≤10 assistant turns per row, overlap = last user message retained.
- **Quality gates:** ≥2 assistant turns, ≥50 chars, content-hash + session-id dedup.

## 2. opencode-dataset — JSONL, safety/routing adapter

- **Path:** `opencode-dataset/train.jsonl` (~5k, 4.3 MB), `val.jsonl`, `run_train.py` present.
- **Record shape (per line):**

| Field | Type | Required | Example / enum |
|-------|------|----------|----------------|
| `id` | `string` | yes | `aug5k_001384` |
| `task_type` | `string` enum | yes | `debug_recovery|command_execution|tool_routing|safety_boundary|response_quality` |
| `messages` | `list<struct{role,content}>` | yes | `[system: "You are Clawd...", user: "..."]` — 2 messages, no tool_calls in messages |
| `tools_available` | `string[]` | yes | subset of `[edit,exec,gateway,web_fetch,read,browser]` (non-canonical names) |
| `target.assistant` | `string` | yes | canned `"Acknowledged. Proceeding..."` |
| `target.tool_calls` | `list<{name, arguments}>` | yes | simplified; `arguments: {command: "echo placeholder"}` |
| `target.final_response` | `string` | yes | expected assistant text |
| `quality` | `struct` | no | `{safety_ok, tool_choice_ok, command_validity_ok: bool}` |
| `metadata` | `struct` | no | `{source, difficulty: low|medium|high, os: linux, tags, augmented: bool, hard_negative, seed_origin, aug_index}` |

- **Note:** `tool_calls` encoding here is simplified (no `id`/`type`/`function.arguments` JSON string) — must be normalized to OpenAI shape for canonical.

## 3. opencode-tool-calling — JSONL, tool-use SFT

- **Path:** `opencode-tool-calling/opencode/train.jsonl` (6,290 rows), `eval.jsonl` (1 row), `tool_inventory.json` (13 tools).
- **Record shape:**

| Field | Type | Required | Example |
|-------|------|----------|---------|
| `id` | `string` | yes | `opencode-single-bash-000` |
| `split` | `string` enum | yes | `train|eval` |
| `tags` | `string[]` | yes | `["opencode","single_tool","bash"]` or `["opencode","untrusted","error_recovery"]` etc. |
| `messages` | `list<struct>` | yes | OpenAI Messages with tool adjacency: `user → assistant(tool_calls) → tool → assistant` |
| `messages[].role` | `string` enum | yes | `user|assistant|tool` |
| `messages[].content` | `string` | yes | user/assistant content (`""` when tool-call-only) |
| `messages[].tool_calls` | `list` | cond | OpenAI: `{id, type:function, function:{name, arguments: JSON string}}` |
| `messages[].tool_call_id` | `string` | cond | on `tool` role |
| `messages[].name` | `string` | cond | on `tool` role, equals `function.name` |

- **Tool vocab (13, from `tool_inventory.json`):** `bash, read, edit, write, grep, glob, lsp, apply_patch, skill, todowrite, webfetch, websearch, task`.
- **Distribution:** ~550–970 per tool (read 973 most, websearch 403 least); synthetic 5000 of 6290.

## 4. opencode-ecosystem-core — Monorepo catalog (taxonomy source)

- **Path:** `opencode-ecosystem-core/` — 279 Python files, `specs/` (28 SPECs), `trust/`, `translation/`, `transformer/`, `tests/`.
- **No dataset file** — serves as **tag taxonomy / domain ontology** for canonical `tags`/`task_type`. Relevant taxonomies: legal, translation, trust, transformer domains. Not a row-level schema; adapters should map its module/spec names to canonical tags.

## 5. Cross-Template Comparison

| Dimension | agentic-mini | dataset (safety) | tool-calling | ecosystem-core |
|-----------|--------------|-------------------|--------------|----------------|
| File format | Parquet | JSONL | JSONL | Python monorepo |
| Row = | chunked session (≤10 turns) | single task attempt | single/multi tool episode | — |
| Messages shape | full OpenAI + tool adjacency + reasoning_content | simplified system+user only | full OpenAI tool adjacency | — |
| Tool_calls encoding | OpenAI `function.arguments` JSON string | simplified `{name, arguments: object}` | OpenAI `function.arguments` JSON string | registry in `tool_inventory.json` |
| Tool vocab | open (bash 43k, read 26k...) | `[edit,exec,gateway,web_fetch,read,browser]` | 13-tool closed vocab | — |
| Reasoning | `reasoning_content` per assistant | none (target.assistant is canned) | none | — |
| Metadata | `metadata.{session_id, chunk_index, total_chunks, has_tool_use, has_reasoning}` | `metadata.{source, difficulty, tags}` + `quality` | `tags` (skill/tool names) | — |
| IDs | `metadata.session_id` | `id` | `id` | — |
| Common fields | `messages`, `tool_calls`, tool result linkage via `tool_call_id` | — | — | — |
| Divergent | chunked, reasoning, timestamp | safety `task_type` enum, `quality` gate | single_tool tag, 13-tool vocab | taxonomy only |

## 6. Field-Mapping Table: Template Field → Canonical Field

Canonical target defined in T1.4: `Session { id, turns: Turn[], meta }` where `Turn = { role, content, reasoning_content?, tool_calls?: ToolCall[], tool_call_id?, name? }`, `ToolCall = { id, name, arguments: object (parsed), raw_arguments: string }`.

| Template field | Canonical field | Transform |
|----------------|-----------------|-----------|
| `agentic-mini.messages[].role` | `turn.role` | direct |
| `agentic-mini.messages[].content` | `turn.content` | direct; null → "" |
| `agentic-mini.messages[].tool_call_id` | `turn.tool_call_id` | direct |
| `agentic-mini.messages[].tool_calls[].function.name` | `turn.tool_calls[].name` | direct; normalize `bash` vs `exec` |
| `agentic-mini.messages[].tool_calls[].function.arguments` (JSON string) | `turn.tool_calls[].raw_arguments` + `turn.tool_calls[].arguments` (parsed JSON) | `JSON.parse` |
| `agentic-mini.messages[].reasoning_content` | `turn.reasoning_content` | direct; → EasyDataset `cot` |
| `agentic-mini.metadata.session_id` | `session.id` | direct |
| `agentic-mini.metadata.*` (title/project/model/timestamp/chunk_index/total_chunks/has_*) | `session.meta.*` | preserve in `meta` |
| `dataset.id` | `session.id` (or `turn.id`) | synthetic; prefix `ds_` |
| `dataset.task_type` | `session.meta.task_type` + `tags` | enum → tag; also maps to EasyDataset `questionLabel` |
| `dataset.messages[system].content` | `session.meta.system_prompt` | `"You are Clawd..."` |
| `dataset.messages[user].content` | `turn.content` where `role=user` | direct |
| `dataset.tools_available` | `session.meta.tools_available` | normalize `exec→bash`, `web_fetch→webfetch` |
| `dataset.target.tool_calls[].name` | `turn.tool_calls[].name` | direct |
| `dataset.target.tool_calls[].arguments` (object) | `turn.tool_calls[].arguments` + `raw_arguments = JSON.stringify` | stringify |
| `dataset.target.final_response` | trailing `turn.content` (`role=assistant`) | direct |
| `dataset.quality` | `session.meta.quality` | preserve |
| `tool-calling.id` | `session.id` | prefix `tc_` |
| `tool-calling.tags` | `session.meta.tags` | direct |
| `tool-calling.messages[].*` | `turn.*` | same as agentic-mini (already OpenAI shape) |
| `tool_inventory.json: tools[].name` | canonical tool vocab | closed 13 + `custom` bucket for unknowns |
| `ecosystem-core` module/spec names | `session.meta.tags` | heuristic tag enrichment |

## 7. EasyDataset Import Mapping (preview for T1.4/T3.1)

- Single-turn `Datasets` import: `question` ← first user turn `content`, `answer` ← serialized assistant+tool_calls (or final_response), `cot` ← `reasoning_content`, `questionLabel` ← `task_type`/tags, `tags` ← `tags`.
- Multi-turn `DatasetConversations`: `rawMessages` ← JSON-stringified `messages` array with tool_calls intact.
