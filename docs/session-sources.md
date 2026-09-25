# Session Sources Inventory (T1.1) — 2026-09-22

## 1. Config / Session Stores

| Path | Type | Status | Details |
|------|------|--------|---------|
| `C:\Users\PC Principal\.config\opencode` | opencode home | **exists** | Contains 4 reference datasets + ephemeral sessions; `session-ses_f408.md` referenced in compaction summary |
| `C:\Users\PC Principal\.config\opencode\.opencode` | opencode project | exists | `opencode.json` 67B, `tui.json` 19B — project-local config |
| `C:\Users\PC Principal\.config\hermes-agent` | hermes-agent checkout | **absent** | Path does not exist; actual hermes install is `%LOCALAPPDATA%\hermes\hermes-agent` |
| `%LOCALAPPDATA%\hermes\hermes-agent` | hermes-agent source | exists | Full source tree (cli.py, hermes_state*.py) |
| `%LOCALAPPDATA%\hermes\state.db` | **Primary session store** | **exists — 23.9 MB** | SQLite, WAL 4MB; holds ALL sessions (CLI/TUI/gateway). `sessions.json` is legacy mirror only |
| `%LOCALAPPDATA%\hermes\sessions\` | Request dumps + legacy mirror | exists | 4× `request_dump_*.json` (321–851 KB each) + `sessions.json` (1.7 KB, gateway routing index only) |
| `%APPDATA%\Hermes` | Electron app data (Hermes desktop) | exists | `DIPS`, `Preferences`, `blob_storage` — no sessions, just Electron caches |
| `%APPDATA%\easy-dataset\local-db\db.sqlite` | EasyDataset runtime DB | exists — 320 KB | SQLite; stores Projects/Datasets/Questions/Chunks — not session history |
| `%APPDATA%\easy-dataset\local-db\db.json` | Migration log | exists — 10 KB | Contains ALTER/CREATE TABLE DDL for versions 1.2.5–1.7.0 |
| `F:\crm\.opencode` | Project opencode config | exists | `goals/`, `skills/`; no session data |
| `F:\crm` | Workspace | exists | Main repo; env + tasks |

### Hermes state.db — inferred tables (from `hermes_state_*.py` filenames)
`gateway_routing` (mirror of sessions.json), `sessions`, `messages`, `projects`, `kanban` (kanban.db separate), plus FTS/timeline/usage tables. Direct table listing requires sqlite3 CLI (python inline hit escaping issue) — verify with `sqlite3 state.db ".tables"`.

### Sessions evidence
| File | Lines/records | `session_id` hits | `tool_calls`/`"role":"tool"` hits |
|------|---------------|-------------------|-----------------------------------|
| `state.db` | TBD (23 MB) | authoritative | authoritative — `hermes_state_sessions.py` + `hermes_state_messages.py` manage session/message rows |
| `request_dump_20260921_043545_eed47e_20260921_193800_475924.json` | ~1 file | 1 (`20260921_043545_eed47e`) | `tool_calls` present (contains compaction summary + tool call log) |
| `request_dump_20260922_043405_72f15b_20260922_120829_770721.json` | ~788 KB | 1 | yes |
| `request_dump_20260922_043405_72f15b_20260922_131540_005839.json` | ~851 KB | 1 | yes |
| `sessions.json` | 1 routing entry | 1 | 0 — not a session, just routing index |

**Sample peek — `sessions.json`** (legacy mirror):
```json
{
  "agent:main:telegram:dm:199251286": {
    "session_id": "20260919_022318_1cb86ab6",
    "platform": "telegram", "chat_type": "dm",
    "display_name": "Slipper_zero"
  }
}
```

**Sample peek — `request_dump` (contains compaction handoff):** includes training log for QLoRA `Qwen/Qwen3.5-4B` (11,253 rows, r=16, RTX 3060), tool_calls with `process_manage` poll.

## 2. Reference Datasets (opencode templates — NOT session sources)

| Path | Format | Size | Records (est.) | Sample |
|------|--------|------|----------------|--------|
| `opencode-agentic-mini/data/train-*.parquet` | Parquet | 101.8 MB | ~7k | Parquet: `messages=[user, assistant+tool_calls, tool]`, `reasoning_content`, `session_id` metadata |
| `opencode-agentic-mini/data/validation-*.parquet` | Parquet | 5.7 MB | — | — |
| `opencode-dataset/train.jsonl` | JSONL | 4.3 MB | ~5k | `{"id":"aug5k_001384","task_type":"debug_recovery","messages":[{role:system},{role:user}],"tools_available":[...],"target":{assistant, tool_calls, final_response}}` |
| `opencode-dataset/val.jsonl` | JSONL | 518 KB | — | same schema |
| `opencode-tool-calling/opencode/train.jsonl` | JSONL | 4.2 MB | ~6.2k | `{"id":"opencode-single-bash-000","split":"train","tags":["single_tool","bash"],"messages":[{user},{assistant+tool_calls:bash},{tool}],...}` |
| `opencode-tool-calling/opencode/eval.jsonl` | JSONL | 1.3 KB | — | — |
| `opencode-tool-calling/data/*.jsonl` | JSONL | 0 B | 0 | empty — generated target not yet populated |
| `opencode-ecosystem-core/integrations/.evolve/antigravity-task-log.jsonl` | JSONL | 139 KB | — | monorepo catalog log |

Grep: `session_id` count in `opencode-dataset/train.jsonl` = **0** (uses `id` + `messages`, not session_id). `tool_calls` present in all three templates.

## 3. Domain / F: Drive Stores (reference only, not session sources)

### F:\Telemarketing — 37 matching files (*.jsonl/parquet/csv)
| File | Size | Notes |
|------|------|-------|
| `datasets/misc/classifier_dataset.jsonl` | 13.5 MB | — |
| `datasets/misc/earnings_calls_10k_disclosures.jsonl` | 69.3 MB | — |
| `datasets/misc/scam_train-*.parquet` | 21.8 MB | — |
| `datasets/misc/leadai_fraud_train-*.parquet` | 4.1 MB | — |
| `datasets/misc/anchoring/herding/confirmation/loss-aversion/recency/neutral.jsonl` | ~1 MB each | bias sets |
| `datasets/jdk-salesbot/*.{parquet,jsonl}` | 46 KB + 127 KB | — |
| `datasets/coldcalling/*.{jsonl,csv}` | 235–349 KB | — |
| `datasets/misc/credit-card-fraud-CLEAN.csv` | 71 MB | — |
No `session_id` / `tool_calls` hits — domain data, not sessions.

### F:\Training_Lab — 522 matching files (76 jsonl + 12 parquet + 434 csv, 282k png ignored)
Key JSONL: `LLaMA-Factory/data/sniper_train.jsonl` 53 MB, `trend_train.jsonl` 190 MB, `multi_candle_sft/dpo.jsonl` 7 MB each, `XAUUSD_*_labeled.parquet` + 10k GAF PNGs. No session schema.

### F:\.cache\huggingface\hub\datasets — 97 repos
Sample: `bank-telesales`, `scam-*`, `telesales*`, `sales-transcripts`, `voice-agent-*`, `xauusd-*`, `opencode-agentic-mini`, `92k-call-center-scripts`, etc. Blobs content-addressed under `blobs/`; 0-byte refs possible — resolve via blobs store. Cached downloads, not sessions.

### F:\.cache\huggingface\hub\models — contains `models--Qwen--Qwen3.5-4B` (2 shards, ~11 GB) per request_dump log.

### F:\datasets — 6 sub-projects (per plan): aksharaMD, doc2dataset, easy-dataset-1.7.3, OpenIngest, OpenTuneWeaver (4 jsonl), Training_Data_Bot.

## 4. Grep Summary — True Session Identification

| Pattern | True sessions | Reference templates | Domain jsonl |
|---------|---------------|---------------------|--------------|
| `session_id` | ✅ `state.db` + `request_dump*.json` | ❌ (0 hits) | ❌ |
| `"role": "tool"` | ✅ state.db messages + request_dump | ✅ templates (tool role present) | ❌ |
| `tool_calls` | ✅ all session stores + templates | ✅ | ❌ |

**Classification rule:** `session_id` + `tool_calls` co-occurrence + SQLite `state.db` = true local sessions. Templates have `tool_calls` but no `session_id`. Domain jsonl has neither.

## 5. Counts per Extension (scoped)

| Root | .jsonl | .parquet | .csv | .sqlite/.db | .json | Notes |
|------|--------|----------|------|-------------|-------|-------|
| `~/.config/opencode` | 6 | 2 | 0 | 0 | many | 4 template datasets |
| `%LOCALAPPDATA%\hermes` | 1 (.icarus-telemetry) | 0 | 0 | 3 (state.db, kanban.db, shared-state.db + projects.db) | many | primary sessions in state.db |
| `%APPDATA%\easy-dataset` | 0 | 0 | 0 | 1 (db.sqlite 320KB) | 1 (db.json) | runtime dataset DB |
| `F:\Telemarketing` | 18 | 11 | 8 | — | — | per plan counts (verified 37 total) |
| `F:\Training_Lab` | 76 | 12 | 434 | — | — | 282k png excluded |
| `F:\.cache\huggingface\hub\datasets` | 97 repos | blobs | — | — | — | cached downloads |

## 6. Open Items / Next Steps for T1.2–T1.3
- Run `sqlite3 "%LOCALAPPDATA%\hermes\state.db" "SELECT name FROM sqlite_master WHERE type='table'; SELECT count(*) FROM sessions; SELECT count(*) FROM messages;"` to get exact session/message counts (python escaping blocked inline).
- Inspect `state.db` schema for `messages` columns (role, tool_calls, tool_call_id linkage).
- Parquet schema via `pyarrow.parquet.ParquetFile(...).schema` for agentic-mini.
