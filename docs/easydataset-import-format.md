# EasyDataset Import Format (T1.2)

Source: `F:\datasets\easy-dataset-1.7.3` (v1.7.3, package.json version 1.7.2) + runtime `%APPDATA%\easy-dataset\local-db\db.sqlite`.
Date: 2026-09-22

## 1. Two Distinct Ingest Paths

### 1a. Document Upload (primary, LLM-driven pipeline)

- **Endpoint:** `POST /api/projects/[projectId]/files` (`app/api/projects/[projectId]/files/route.js:154`)
- **Accepted file types:** `.md` and `.pdf` only (`route.js:189` — `fileName.endsWith('.md')||'.pdf'`; error message says "Only Markdown files are supported" but code accepts both). Other formats (DOCX/TXT/EPUB) mentioned in README are handled via pre-conversion before upload.
- **Transport:** Binary body + `x-file-name` header (URL-encoded filename). No multipart.
- **Storage:** `local-db/[projectId]/files/[fileName]` (via `getProjectRoot()` + `ensureDir`). Metadata in `UploadFiles` table, chunks in `Chunks` via `lib/file/text-splitter`.
- **Export formats:** Alpaca, ShareGPT, Multilingual-Thinking (README:70); JSON/JSONL; via `POST /api/projects/[projectId]/datasets/export`.

### 1b. Direct Dataset Import (bulk JSON, no LLM)

- **Endpoint:** `POST /api/projects/[projectId]/datasets/import` (`app/api/projects/[projectId]/datasets/import/route.js`)
- **Body:** `{ datasets: Array<DatasetRecord>, sourceInfo?: any }`
- **Behavior:** Iterates records, validates `question`+`answer` required, creates `Datasets` rows with `nanoid()` questionId.

**For session-to-dataset conversion (this project): path 1b is the target** — bypass LLM generation, inject pre-built Q/A pairs directly.

## 2. `Datasets` Import Record Schema

From `prisma/schema.prisma:109-134` and `import/route.js:19-88`:

| Field | Type | Required | Default / Normalization | Notes |
|---|---|---|---|---|
| `question` | string | **yes** | trimmed, non-empty | Missing/empty → skipped, counted in `skippedCount` |
| `answer` | string | **yes** | trimmed, non-empty | Missing/empty → skipped |
| `chunkName` | string | no | `"Imported Data"` | Preserved for export grouping |
| `chunkContent` | string | no | `"Imported from external source"` | Context chunk |
| `model` | string | no | `"imported"` | Training metadata |
| `questionLabel` | string | no | `""` | Tag/label; maps to domain tree Tags |
| `cot` | string | no | `""` | Chain-of-thought; empty allowed; source is `llmRes.reasoning` or `<think>` extraction (`lib/llm/core/index.js:243-264`) |
| `confirmed` | boolean | no | `false` | If true, included in "confirmed-only" exports |
| `score` | number | no | `0` | AI quality score |
| `tags` | string \| string[] \| object | no | `"[]"` (JSON string) | Stored as JSON string in DB; arrays/objects stringified |
| `note` | string | no | `""` | Annotation |
| `other` | string \| object | no | `"{}"` (JSON string) | Arbitrary extra JSON |
| `questionId` | auto | — | `nanoid()` | Generated server-side, not supplied |

`DatasetConversations` (multi-turn) is separate: `POST /api/projects/[projectId]/dataset-conversations` with fields `question, scenario, roleA, roleB, turnCount, maxTurns, rawMessages` (JSON string, ShareGPT format), `questionLabel, model, score, tags, note, confirmed`. See `prisma/schema.prisma:136-160` and `lib/services/multi-turn/index.js:115-128`.

## 3. Runtime DB

- **Path:** `%APPDATA%\easy-dataset\local-db\db.sqlite` (327 KB) + `db.json` (prisma sql snapshot). Tables match `prisma/schema.prisma` exactly.
- **Observed tables:** `Projects, UploadFiles, Chunks, Tags, Questions, Datasets, DatasetConversations, LlmProviders, LlmModels, ModelConfig, Task, CustomPrompts, GaPairs, Images, ImageDatasets, QuestionTemplates, LlmUsageLogs, EvalDatasets, EvalResults` (19 tables).
- **Existing data:** 1 project subdir `4yUdNzEga3YN` under `local-db/`.

## 4. Export & Training Integration

- **Datasets export:** `POST /api/projects/[projectId]/datasets/export` — supports `batchMode`, `balanceMode` (per-tag counts), `confirmed` filter, `selectedIds`.
- **Multi-turn export:** `GET /api/projects/[projectId]/dataset-conversations/export`.
- **LLaMA Factory:** `POST /api/projects/[projectId]/llamaFactory/generate` — generates training config from datasets.
- **Hugging Face:** `POST /api/projects/[projectId]/huggingface/upload`.

## 5. Encoding & Constraints

- **Encoding:** UTF-8 JSON. `question`/`answer`/`cot` are plain strings; no binary.
- **Tool calls:** Not a first-class field in `Datasets`. To preserve tool-call sessions, serialize as text in `answer` (e.g., JSON-stringified tool_calls) or use `DatasetConversations.rawMessages` ShareGPT JSON with `tool_calls`/`tool` roles — `rawMessages` is opaque JSON string, so any valid ShareGPT messages array is accepted.
- **No file-type import for JSON:** There is no `.jsonl` file upload import; the file upload path only accepts `.md`/`.pdf`. JSON datasets must go via `POST .../datasets/import`.
- **SQLite limits:** No explicit row cap; `Datasets` indexed on `(projectId, confirmed, createAt, id)` for export.

## 6. Minimal Valid Import Example

```json
{
  "datasets": [
    {
      "question": "How do I list files in a repo?",
      "answer": "Use `glob` with pattern **/*.ts or `read` on directory.",
      "chunkName": "session-abc",
      "chunkContent": "Context: opencode session excerpt ...",
      "model": "imported",
      "questionLabel": "tool-calling",
      "cot": "User wants file listing; tool glob is appropriate because ...",
      "tags": ["tool-calling", "glob"],
      "confirmed": true,
      "score": 1.0
    }
  ]
}
```

Multi-turn equivalent (`DatasetConversations`):

```json
{
  "question": "First user turn",
  "scenario": "pair-programming",
  "roleA": "Developer",
  "roleB": "Assistant",
  "turnCount": 6,
  "maxTurns": 10,
  "rawMessages": "[{\"role\":\"user\",\"content\":\"...\"},{\"role\":\"assistant\",\"content\":\"...\",\"tool_calls\":[...]}]",
  "questionLabel": "agentic-mini",
  "confirmed": true
}
```

## 7. Implications for T3.1

- Target `POST .../datasets/import` for single-turn QA / tool-calling / safety adapters.
- For agentic-mini (multi-turn with tool adjacency): use `DatasetConversations` API with `rawMessages` = ShareGPT messages JSON.
- Set `confirmed: true` so exports include records without manual review.
- `cot` field carries reasoning_content; export will include it if not empty.
- No need to handle `app.asar` — runtime DB path confirmed; source checkout `prisma/schema.prisma` is authoritative and matches runtime.
