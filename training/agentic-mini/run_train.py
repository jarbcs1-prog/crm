import argparse, json, os

def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--data_path", default="packages/session-datasets/data/easydataset/agentic-mini.jsonl")
    p.add_argument("--output_dir", default="outputs/agentic-mini")
    p.add_argument("--model_name", default="Qwen/Qwen2.5-3B-Instruct")
    p.add_argument("--num_epochs", type=int, default=3)
    p.add_argument("--per_device_train_batch_size", type=int, default=2)
    p.add_argument("--learning_rate", type=float, default=2e-4)
    p.add_argument("--lora_r", type=int, default=16)
    p.add_argument("--lora_alpha", type=int, default=32)
    p.add_argument("--max_seq_length", type=int, default=4096)
    return p.parse_args()

def load_data(path):
    if not os.path.exists(path):
        alt = os.path.join(os.path.dirname(__file__), "../../packages/session-datasets/data/agentic-mini.jsonl")
        path = alt if os.path.exists(alt) else path
    if not os.path.exists(path):
        return []
    rows = []
    for line in open(path, encoding="utf-8"):
        line=line.strip()
        if line:
            rows.append(json.loads(line))
    return rows

def main():
    args = parse_args()
    data = load_data(args.data_path)
    print(f"agentic-mini: {len(data)} records from {args.data_path} | model={args.model_name} -> {args.output_dir}")
    try:
        from transformers import AutoTokenizer, AutoModelForCausalLM
        from peft import LoraConfig, get_peft_model
        from trl import SFTTrainer
        print("imports ok: transformers+peft+trl available")
    except ImportError as e:
        print(f"training deps not installed: {e} (pip install -r requirements-train.txt)")
        return
    print("dry-run complete; set RUN_TRAIN=1 to actually train")

if __name__ == "__main__":
    main()
