# Progress — 2026-09-22 Session Summary

## What Was Built

### Stage 1: Foundation (T1.1-T1.5)
- `docs/session-sources.md` — exhaustive inventory: opencode/hermes/easy-dataset/HF hub/F: drives (Telemarketing 202k files, Training_Lab 422k files)
- `docs/easydataset-import-format.md` — EasyDataset import spec from asar+DB inspection
- `docs/reference-schemas.md` — 4 template schemas + field mapping table
- `docs/unified-schema.md` — canonical Session/Turn/ToolCall design
- `packages/session-datasets/src/schema.ts` + adapters + extractor + chunking + dedup/PII

### Stage 2: Core (T2.1-T2.6)
- Extractor: streaming parser over ALL local sources, role normalization, source tag, truncation
- Chunking: sliding window ≤10 turns, overlap 1-2, tool-adjacency guard
- 3 adapters: agentic-mini (Parquet/JSONL), tool-calling (JSONL, 13-tool vocab), safety/routing (JSONL+system+taxonomy)
- Dedup (content-hash) + PII scrub (<REDACTED>)

### Stage 3: Polish (T3.1-T3.4)
- `export:easydataset` → `data/easydataset/questions.jsonl` + `manifest.json`
- Validators: `validate:agentic-mini`, `validate:tool-calling`, `validate:safety`, `stats`
- Training configs: `training/{agentic-mini,tool-calling,safety,distill}/run_train.py` (QLoRA Qwen2.5-3B)
- `docs/session-datasets.md` — full usage guide

## Verification

| Check | Result |
|-------|--------|
| `bunx tsc --noEmit` (session-datasets) | PASS |
| `validate:agentic-mini` — 175 records, ~286k tokens, parquet 175 rows | PASS |
| `validate:tool-calling` — 511 records, ~453k tokens | PASS |
| `validate:safety` — 7 records | PASS |
| `stats` — canonical 7, agentic-mini 175, tool-calling 511, safety 7 | PASS |
| `python -m py_compile training/**/run_train.py` | PASS |
| E2E smoke (extract→chunk→adapters→dedup/PII→EasyDataset on hermes state.db 7 sessions) | PASS |
| Parquet vs JSONL outputs | PASS |
| `docs/session-datasets.md` fresh-checkout reproduction | PASS |

Fix applied: generated missing `data/agentic-mini.parquet` via pyarrow (adapter helper path corrected).

## What's Pending (Next Session)

See `TODO_NEXT.md` — 4 sections: EasyDataset import, training runs, source expansion, other recommendations.
Active source is small (hermes state.db = 7 sessions). Primary next work is scale + training.

## Repo State

- Branch: current (check `git status`)
- All Stages 1-3 complete. Ship check green (6/6).
- Docs mirrored to `F:\datasets\docs\` where applicable.
