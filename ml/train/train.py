"""
微调 mDeBERTa-v3-base 做逐行章节标题二分类。

输入是 build_dataset.py 产出的 JSONL（prev/text/next/label）。
把上下文窗口拼成单条输入：  prev [SEP] text [SEP] next，让模型看到相邻行判断标题性。

需要 GPU 机器运行（CPU 上不现实）。产出 HuggingFace 格式模型，交给 export_onnx.py 转 ONNX。

用法:
    pip install -r ../requirements.txt
    python3 train.py --data ../data/out/dataset.jsonl --out out/model
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
from datasets import Dataset
from sklearn.metrics import precision_recall_fscore_support
from transformers import (
    AutoModelForSequenceClassification,
    AutoTokenizer,
    DataCollatorWithPadding,
    Trainer,
    TrainingArguments,
)

MODEL_ID = "microsoft/mdeberta-v3-base"
MAX_LEN = 128
# 正类标签需与前端 lib/nlp/index.ts 的 DEFAULT_POSITIVE_LABEL 保持一致
LABELS = ["not_title", "title"]


def load_records(path: Path) -> list[dict]:
    with path.open(encoding="utf-8") as f:
        return [json.loads(line) for line in f]


def dedupe(records: list[dict]) -> list[dict]:
    """按 (text,label) 去重，避免同一标题在 train/test 间泄漏。"""
    seen = set()
    out = []
    for r in records:
        key = (r["text"], r["label"])
        if key in seen:
            continue
        seen.add(key)
        out.append(r)
    return out


def make_text(r: dict) -> str:
    return f"{r.get('prev', '')} [SEP] {r['text']} [SEP] {r.get('next', '')}"


def split_by_book(records: list[dict], holdout_frac: float = 0.15) -> tuple[list[dict], list[dict]]:
    """按书划分 train/eval：同一本书不跨集，避免风格泄漏，逼近真实泛化。"""
    books = sorted({r["book"] for r in records})
    cut = int(len(books) * (1 - holdout_frac))
    train_books = set(books[:cut])
    train = [r for r in records if r["book"] in train_books]
    dev = [r for r in records if r["book"] not in train_books]
    return train, dev


def compute_metrics(pred) -> dict:
    logits, labels = pred
    preds = np.argmax(logits, axis=-1)
    p, r, f, _ = precision_recall_fscore_support(labels, preds, average="binary", zero_division=0)
    return {"precision": p, "recall": r, "f1": f}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True)
    ap.add_argument("--out", default="out/model")
    ap.add_argument("--epochs", type=float, default=3.0)
    ap.add_argument("--batch", type=int, default=32)
    args = ap.parse_args()

    records = dedupe(load_records(Path(args.data)))
    train_recs, dev_recs = split_by_book(records)
    print(f"训练 {len(train_recs)} 行, 验证 {len(dev_recs)} 行")

    tokenizer = AutoTokenizer.from_pretrained(MODEL_ID)

    def encode(batch):
        enc = tokenizer(
            [make_text({"prev": p, "text": t, "next": n}) for p, t, n in zip(batch["prev"], batch["text"], batch["next"])],
            truncation=True,
            max_length=MAX_LEN,
        )
        enc["labels"] = batch["label"]
        return enc

    train_ds = Dataset.from_list(train_recs).map(encode, batched=True, remove_columns=["book", "prev", "text", "next", "label"])
    dev_ds = Dataset.from_list(dev_recs).map(encode, batched=True, remove_columns=["book", "prev", "text", "next", "label"])

    model = AutoModelForSequenceClassification.from_pretrained(
        MODEL_ID,
        num_labels=len(LABELS),
        id2label=dict(enumerate(LABELS)),
        label2id={label: i for i, label in enumerate(LABELS)},
    )

    training_args = TrainingArguments(
        output_dir=args.out,
        num_train_epochs=args.epochs,
        per_device_train_batch_size=args.batch,
        per_device_eval_batch_size=args.batch,
        eval_strategy="epoch",
        save_strategy="epoch",
        load_best_model_at_end=True,
        metric_for_best_model="f1",
        learning_rate=2e-5,
        warmup_ratio=0.1,
        # 类别不平衡（约 1:29）：靠更长训练 + F1 选优；如需可换带 class_weight 的自定义 loss
        logging_steps=50,
    )

    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=train_ds,
        eval_dataset=dev_ds,
        tokenizer=tokenizer,
        data_collator=DataCollatorWithPadding(tokenizer),
        compute_metrics=compute_metrics,
    )
    trainer.train()
    metrics = trainer.evaluate()
    print("最终验证指标:", metrics)
    trainer.save_model(args.out)
    tokenizer.save_pretrained(args.out)
    print(f"模型已保存到 {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
