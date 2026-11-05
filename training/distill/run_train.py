import argparse, json, os

def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--data_path", default="packages/session-datasets/data/easydataset/easydataset-import.json")
    p.add_argument("--output_dir", default="outputs/distill")
    p.add_argument("--model_name", default="Qwen/Qwen2.5-3B-Instruct")
    p.add_argument("--teacher_model", default="Qwen/Qwen2.5-14B-Instruct")
    p.add_argument("--num_epochs", type=int, default=3)
    p.add_argument("--per_device_train_batch_size", type=int, default=2)
    p.add_argument("--learning_rate", type=float, default=2e-4)
    p.add_argument("--temperature", type=float, default=2.0)
    p.add_argument("--alpha", type=float, default=0.5)
    p.add_argument("--lora_r", type=int, default=16)
    p.add_argument("--lora_alpha", type=int, default=32)
    p.add_argument("--max_seq_length", type=int, default=4096)
    return p.parse_args()

def load_data(path):
    if not os.path.exists(path):
        alt = os.path.join(os.path.dirname(__file__), "../../packages/session-datasets/data/easydataset/easydataset-import.json")
        path = alt if os.path.exists(alt) else path
    if not os.path.exists(path):
        return []
    text = open(path, encoding="utf-8").read().strip()
    try:
        obj = json.loads(text)
        if isinstance(obj, dict) and "datasets" in obj:
            return obj["datasets"]
        if isinstance(obj, list):
            return obj
    except Exception:
        pass
    return [json.loads(l) for l in text.splitlines() if l.strip()]

def main():
    args = parse_args()
    data = load_data(args.data_path)
    print(f"distill: {len(data)} records from {args.data_path} | student={args.model_name} teacher={args.teacher_model} T={args.temperature} alpha={args.alpha} -> {args.output_dir}")
    try:
        from transformers import AutoTokenizer
        from peft import LoraConfig
        print("imports ok (distillation uses KLDivLoss with temperature scaling)")
    except ImportError as e:
        print(f"training deps not installed: {e}")
        return
    print("dry-run complete; distillation loss = alpha*CE + (1-alpha)*T^2*KL(student/T || teacher/T)")

if __name__ == "__main__":
    main()
