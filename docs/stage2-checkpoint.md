# Stage 2 Checkpoint — 2026-09-22

| Step | Status | Details |
|------|--------|---------|
| 1. `tsc --noEmit` | ✅ PASS | `bunx tsc --noEmit` exit 0, no errors |
| 2. Extractor | ✅ PASS | `bun run extract` → 7 sessions → `data/canonical.jsonl` (2.1 MB) |
| 3a. `build:agentic-mini` | ✅ PASS | `data/agentic-mini.jsonl` — 140 chunked records |
| 3b. `build:tool-calling` | ✅ PASS | `data/tool-calling.jsonl` — 471 records |
| 3c. `build:safety` | ✅ PASS | `data/safety-routing.jsonl` — 7 records |
| 4. Dedup/PII filter | ✅ PASS | dedup: 7 unique, 0 duplicates; PII scrub active (emails, keys, `<user-home>\\...` redacted; first session had PII redacted) |
| 5. Stats report | ✅ PASS | see below |

## Stats

- **Counts per source:** `hermes-state-db: 7` (no opencode sessions found on this checkout; `imported` source empty)
- **Avg turns:** 161.1 (total 1128 turns across 7 sessions)
- **Tool distribution (canonicalName):** `custom: 563` — all hermes tool names fall outside the 13-tool vocab; normalized to `custom` with original name preserved in `ToolCall.name`
- **Turn-count histogram:** 32×1, 35×1, 37×1, 136×1, 162×1, 288×1, 438×1
- **Adapter row counts:** agentic-mini 140 chunks, tool-calling 471, safety 7
- **Chunking:** ≤10 turns, overlap 1–2, tool adjacency preserved

## Fix applied

None required — all steps passed. PII module export is `scrubPii`/`scrubSession` (not `scrubPII`); dedup API is `dedup(sessions) => {unique, duplicates}`.

## Notes / follow-up

- Single source (`hermes-state-db`) dominates — expected per Stage 1 inventory. No opencode session store present.
- 100% `custom` tool vocab suggests hermes tool names don't overlap opencode's 13-tool set; acceptable per T1.4 `custom` bucket, but worth mapping hermes names to canonical aliases if training signal matters (add entries to `TOOL_ALIASES`).
