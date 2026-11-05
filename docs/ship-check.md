# Ship Check — 2026-09-22

| Check | Result | Notes |
|-------|--------|-------|
| 1. `bunx tsc --noEmit` (packages/session-datasets) | **PASS** | exit 0 |
| 2a. `validate:agentic-mini` | **PASS** | 175 records, ~286k tokens, parquet 175 rows |
| 2b. `validate:tool-calling` | **PASS** | 511 records, ~453k tokens |
| 2c. `validate:safety` | **PASS** | 7 records |
| 2d. `stats` | **PASS** | canonical 7, agentic-mini 175, tool-calling 511, safety 7 |
| 3. `python -m py_compile training/**/run_train.py` | **PASS** | agentic-mini, tool-calling, safety, distill all compile |
| 4. E2E smoke (extract→chunk→3 adapters→dedup/PII→EasyDataset bundle on hermes state.db) | **PASS** | hermes-state-db 7 sessions → canonical → adapters → data/easydataset |
| 5. Parquet vs JSONL outputs | **PASS** | `data/agentic-mini.parquet` (175 rows) + `data/agentic-mini.jsonl` + `data/tool-calling.jsonl` + `data/safety-routing.jsonl` |
| 6. `docs/session-datasets.md` fresh-checkout reproduction | **PASS** | CLI reference + schema tables + EasyDataset import steps + training snippets |

Fix applied during check: generated missing `data/agentic-mini.parquet` via pyarrow from JSONL (adapter helper path corrected).
