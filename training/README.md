# Training Configs

All configs default to `Qwen/Qwen2.5-3B-Instruct` via QLoRA. Parameterized: `--data_path`, `--output_dir`, `--model_name`.

## EasyDataset bundle -> training inputs

1. Extract sessions: `bun run src/extractor/index.ts --input <sessions> --out data/canonical.jsonl`
2. Build adapters: `build:agentic-mini`, `build:tool-calling`, `build:safety` -> `data/*.jsonl`
3. Export EasyDataset bundle: `bun run src/export/easyDataset.ts --input data/canonical.jsonl --out data/easydataset`
   - Produces `data/easydataset/easydataset-import.json` (Datasets table: question/answer/cot)
   - Produces `data/easydataset/easydataset-conversations.json` (multi-turn with rawMessages)
   - Produces `data/easydataset/manifest.json` (field mapping)
4. Inside EasyDataset UI: import the JSON, review/curate, export final dataset (JSONL/ShareGPT) for training.

## Shape -> config mapping

| Shape | Adapter output | EasyDataset source | Training config | Notes |
|-------|---------------|-------------------|-----------------|-------|
| agentic-mini | `data/agentic-mini.jsonl` (Parquet-ready) | `easydataset-import.json` + conversations | `training/agentic-mini/run_train.py` | 4096 ctx, tool adjacency preserved, chunked 10 turns overlap 1-2 |
| tool-calling | `data/tool-calling.jsonl` | `easydataset-import.json` filtered has_tool_use | `training/tool-calling/run_train.py` | 13-tool vocab, OpenAI tool_calls format |
| safety | `data/safety-routing.jsonl` | `easydataset-import.json` with taxonomy | `training/safety/run_train.py` | 2048 ctx, system="You are Clawd...", taxonomy labels |
| distill | all above merged | `easydataset-import.json` (full) | `training/distill/run_train.py` | student Qwen2.5-3B, teacher Qwen2.5-14B, T=2.0, KL+CE |

## Usage

```
pip install -r training/requirements-train.txt
python training/agentic-mini/run_train.py --data_path data/easydataset/agentic-mini.jsonl --output_dir outputs/agentic-mini --model_name Qwen/Qwen2.5-3B-Instruct
python training/tool-calling/run_train.py --data_path data/easydataset/tool-calling.jsonl --output_dir outputs/tool-calling
python training/safety/run_train.py --data_path data/easydataset/safety-routing.jsonl --output_dir outputs/safety
python training/distill/run_train.py --data_path data/easydataset/easydataset-import.json --output_dir outputs/distill --teacher_model Qwen/Qwen2.5-14B-Instruct
```
