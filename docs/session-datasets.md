# Session Datasets — Usage Guide

## Flow

```
templates (4 × opencode-*) ─┐
                             ├─► canonical (Session/Turn/ToolCall) ─► adapters ─► EasyDataset ─► train / finetune / distill
local sessions ──────────────┘         │                    ├─ agentic-mini (parquet/jsonl)
                                       │                    ├─ tool-calling (jsonl)
                                       │                    └─ safety/routing (jsonl)
                                       └─ dedup + PII scrub
```

## CLI Reference

All commands run from `packages/session-datasets` (`bun run <script>`):

| Command | Description | Args |
|---------|-------------|------|
| `extract` | Stream-parse all local sources → `data/canonical.jsonl` | `--input <path>` `--out <path>` |
| `build:agentic-mini` | Canonical → agentic-mini chunks | `--input data/canonical.jsonl --out data/agentic-mini.jsonl` |
| `build:tool-calling` | Canonical → tool-calling JSONL | `--input data/canonical.jsonl --out data/tool-calling.jsonl` |
| `build:safety` | Canonical → safety/routing JSONL | `--input data/canonical.jsonl --out data/safety-routing.jsonl` |
| `export:easydataset` | Adapter outputs → EasyDataset import bundle | `--input data/canonical.jsonl --out data/easydataset` |
| `export:call-dataset` | Call transcripts → canonical + Judge + Arena | `--input <calls.json> --out data/call-dataset` |
| `build:synthetic-calls` | Deterministic persona×pitch synthetic sessions | `--personas <call-personas.json> --pitches <pitches dir> --out <canonical.jsonl>` |
| `validate:call-dataset` | Source/tags/turns + judge/arena consistency | `[canonical] [judge.json] [arena.json]` (defaults under `data/call-dataset/`) |
| `validate:agentic-mini` | Schema check vs template | `--input data/agentic-mini.jsonl` |
| `validate:tool-calling` | Schema + tool_call_id linkage | `--input data/tool-calling.jsonl` |
| `validate:safety` | system/taxonomy presence | `--input data/safety-routing.jsonl` |
| `stats` | Per-source breakdown, token estimate, chunk histogram | `--input data/canonical.jsonl` |

End-to-end:

```sh
cd packages/session-datasets
bun run extract
bun run build:agentic-mini -- --input data/canonical.jsonl --out data/agentic-mini.jsonl
bun run build:tool-calling -- --input data/canonical.jsonl --out data/tool-calling.jsonl
bun run build:safety -- --input data/canonical.jsonl --out data/safety-routing.jsonl
bun run validate:agentic-mini && bun run validate:tool-calling && bun run validate:safety
bun run stats
bun run export:easydataset -- --input data/canonical.jsonl --out data/easydataset
```

## Schemas

### Canonical (`src/schema.ts`)

| Type | Fields |
|------|--------|
| `Session` | `id: string`, `turns: Turn[]`, `meta: SessionMeta` |
| `Turn` | `role: "user"\|"assistant"\|"tool"\|"system"`, `content: string`, `reasoning_content?: string`, `tool_calls?: ToolCall[]`, `tool_call_id?: string`, `name?: string` |
| `ToolCall` | `id: string`, `name: string` (original), `canonicalName: string`, `arguments: string` (JSON), `rawArguments: string` |
| `SessionMeta` | `source`, `tags: string[]`, `task_type`, `system_prompt`, `tools_available: string[]`, `quality`, `title/project/model/timestamp/chunk_index/total_chunks` |

Tool vocab: 13 canonical (`bash/read/edit/write/grep/glob/lsp/apply_patch/skill/todowrite/webfetch/websearch/task`) + `custom`. Aliases: `exec→bash`, `web_fetch→webfetch`.

### Adapters

| Adapter | Output | Key fields |
|---------|--------|------------|
| agentic-mini | JSONL/Parquet | `messages: {role,content,tool_calls,tool_call_id,reasoning_content}[]`, `metadata: {session_id,chunk_index,total_chunks,source}` |
| tool-calling | JSONL | `id`, `tags`, `messages: [{role,content,tool_calls}]`, `tools` |
| safety/routing | JSONL | `id`, `task_type`, `messages: [system,user]`, `tools_available`, `target: {assistant,tool_calls,final_response}`, `quality`, `metadata` |

Chunking: sliding window ≤10 turns, overlap 1–2, never splits `assistant(tool_calls)` + following `tool` messages.

## EasyDataset Import

Spec: `docs/easydataset-import-format.md`. Mapping:

| Canonical | EasyDataset |
|-----------|-------------|
| first user `content` | `Datasets.question` |
| serialized assistant+tool_calls | `Datasets.answer` |
| `reasoning_content` | `Datasets.cot` |
| `task_type/tags` | `Datasets.questionLabel/tags` |
| `JSON(messages)` | `DatasetConversations.rawMessages` |

Steps:

1. `bun run export:easydataset -- --input data/canonical.jsonl --out data/easydataset` — writes `questions.jsonl` + `manifest.json`.
2. Open EasyDataset → Import → select `data/easydataset/questions.jsonl`.
3. Or direct SQLite: `bun run src/export/easyDataset.ts --sqlite %APPDATA%/easy-dataset/local-db/db.sqlite`.
4. Generate dataset in EasyDataset UI → export for training.

## Per-Source Notes

| Source | Path | Format | Notes |
|--------|------|--------|-------|
| hermes `state.db` | `%LOCALAPPDATA%\hermes\hermes-agent\state.db` or `%APPDATA%\Hermes` | SQLite | Primary source found (7 sessions, 1128 turns). `sessions` + `messages` tables, `tool_calls` JSON column. |
| opencode sessions | `~/.config/opencode` / `<repository-root>/.opencode` | JSONL/SQLite | None found on this checkout — extractor skips gracefully. |
| domain data | `<domain-data-root>` | JSONL/Parquet/CSV | Reference only, not ingested as sessions. See `docs/session-sources.md`. |
| HF cache | `%USERPROFILE%\.cache\huggingface\hub\datasets` | blobs | Cached downloads, excluded from session counts. |
| finished calls | `Call` rows via `export:call-dataset` | calls JSON (`CallRecord[]` or `{calls}`) | `source:call-transcript`; deterministic 4-check Judge (0–1) + blind Arena per pitch; skipped without transcript/summary. |
| synthetic calls | `build:synthetic-calls` from `apps/agent/data/call-personas.json` × `apps/agent/data/pitches/` | canonical JSONL | Tagged `source:synthetic-<personaId>` + `pitch:<stem>`; same content-hash dedup + `<REDACTED>` scrub as real sessions. |

Dedup: content-hash (normalized whitespace, sorted tool_calls). PII: `scrubPii`/`scrubSession` redacts emails, API keys, `C:\Users\...`, tokens → `<REDACTED>`.

## Training

QLoRA configs under `training/<shape>/run_train.py` (default target: Qwen2.5-3B):

```sh
pip install -r training/requirements-train.txt
python training/agentic-mini/run_train.py --data_path packages/session-datasets/data/agentic-mini.jsonl --model Qwen/Qwen2.5-3B --output_dir outputs/agentic-mini
python training/tool-calling/run_train.py --data_path packages/session-datasets/data/tool-calling.jsonl --model Qwen/Qwen2.5-3B --output_dir outputs/tool-calling
python training/safety/run_train.py --data_path packages/session-datasets/data/safety-routing.jsonl --model Qwen/Qwen2.5-3B --output_dir outputs/safety
# distillation variant
python training/distill/run_train.py --teacher Qwen/Qwen2.5-7B --student Qwen/Qwen2.5-3B --data_path data/easydataset/questions.jsonl
```

If using EasyDataset outputs, point `--data_path` to the exported dataset from EasyDataset instead.

See `docs/reference-schemas.md` and `docs/unified-schema.md` for full schema details.
