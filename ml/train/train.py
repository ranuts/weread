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
import sys
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

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from textfeat import make_text  # noqa: E402

# 默认多语言 base；按语言分模型时用 --base 换成 bert-base-chinese / MiniLM 等
# （标准注意力骨干 int8 量化友好，避开 DeBERTa-v3 的量化崩溃，见 docs/chapter-model-deployment.md 2.3）
DEFAULT_BASE = "microsoft/mdeberta-v3-base"
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


# make_text/feat_tokens 来自共享模块 textfeat（前端 lib/nlp 需逐字复刻，见文件顶注释）


def split_by_book(records: list[dict], holdout_frac: float = 0.15) -> tuple[list[dict], list[dict]]:
    """按书划分 train/eval：同一本书不跨集，避免风格泄漏，逼近真实泛化。"""
    books = sorted({r["book"] for r in records})
    cut = int(len(books) * (1 - holdout_frac))
    train_books = set(books[:cut])
    train = [r for r in records if r["book"] in train_books]
    dev = [r for r in records if r["book"] not in train_books]
    return train, dev


def subsample_negatives(records: list[dict], neg_ratio: float, seed: int = 42) -> list[dict]:
    """
    负样本降采样：保留全部正样本，随机保留 neg_ratio×正样本数 的负样本。
    只用于训练集——1:29 的极端不平衡会让模型退化成「全判非标题」（冒烟测试已验证 f1=0）；
    降到约 1:5 训练更快、能真正学到标题特征。验证集不动，保持自然分布以诚实评估。
    """
    import random

    rng = random.Random(seed)
    pos = [r for r in records if r["label"] == 1]
    neg = [r for r in records if r["label"] == 0]
    keep = int(len(pos) * neg_ratio)
    if keep >= len(neg):
        return records
    out = pos + rng.sample(neg, keep)
    rng.shuffle(out)
    return out


def compute_metrics(pred) -> dict:
    logits, labels = pred
    preds = np.argmax(logits, axis=-1)
    p, r, f, _ = precision_recall_fscore_support(labels, preds, average="binary", zero_division=0)
    return {"precision": p, "recall": r, "f1": f}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True)
    ap.add_argument("--base", default=DEFAULT_BASE, help="预训练 base，如 bert-base-chinese（标准注意力，int8 友好）")
    ap.add_argument("--out", default="out/model")
    ap.add_argument("--epochs", type=float, default=2.0)
    ap.add_argument("--batch", type=int, default=16)
    ap.add_argument("--lr", type=float, default=2e-5, help="学习率。DeBERTa-v3 微调不稳，发散时调低到 1e-5")
    ap.add_argument("--limit", type=int, default=0, help="冒烟测试：只用前 N 本书，验证链路是否跑通")
    ap.add_argument("--eval-limit", type=int, default=0, help="只在前 N 行验证集上评估（开发期加速），0 为全量")
    ap.add_argument(
        "--neg-ratio",
        type=float,
        default=5.0,
        help="训练集负样本降采样目标比例（负:正=N:1），缓解 1:29 不平衡。0 表示不降采样",
    )
    args = ap.parse_args()

    records = dedupe(load_records(Path(args.data)))
    train_recs, dev_recs = split_by_book(records)
    if args.limit:
        # 各取若干本书的样本快速验证端到端，不追求效果
        train_books = list(dict.fromkeys(r["book"] for r in train_recs))[: args.limit]
        dev_books = list(dict.fromkeys(r["book"] for r in dev_recs))[: max(1, args.limit // 4)]
        train_recs = [r for r in train_recs if r["book"] in set(train_books)]
        dev_recs = [r for r in dev_recs if r["book"] in set(dev_books)]
        print(f"[冒烟测试] 限制到 {len(train_books)} 训练本 / {len(dev_books)} 验证本")
    if args.neg_ratio > 0:
        before = len(train_recs)
        train_recs = subsample_negatives(train_recs, args.neg_ratio)
        print(f"训练集负样本降采样: {before} → {len(train_recs)} 行 (目标 1:{args.neg_ratio:g})")
    if args.eval_limit and len(dev_recs) > args.eval_limit:
        # 开发期加速：保留全部正样本 + 抽负样本到上限，仍偏自然分布但评估更快
        import random

        rng = random.Random(0)
        dev_pos_recs = [r for r in dev_recs if r["label"] == 1]
        dev_neg_recs = [r for r in dev_recs if r["label"] == 0]
        keep_neg = max(0, args.eval_limit - len(dev_pos_recs))
        dev_recs = dev_pos_recs + rng.sample(dev_neg_recs, min(keep_neg, len(dev_neg_recs)))
    train_pos = sum(r["label"] for r in train_recs)
    dev_pos = sum(r["label"] for r in dev_recs)
    print(f"训练 {len(train_recs)} 行(正 {train_pos}), 验证 {len(dev_recs)} 行(正 {dev_pos})")

    tokenizer = AutoTokenizer.from_pretrained(args.base)

    def encode(batch):
        texts = [
            make_text({"prev": p, "text": t, "next": n, "pos": po})
            for p, t, n, po in zip(batch["prev"], batch["text"], batch["next"], batch["pos"])
        ]
        enc = tokenizer(texts, truncation=True, max_length=MAX_LEN)
        enc["labels"] = batch["label"]
        return enc

    cols = ["book", "prev", "text", "next", "pos", "label"]
    train_ds = Dataset.from_list(train_recs).map(encode, batched=True, remove_columns=cols)
    dev_ds = Dataset.from_list(dev_recs).map(encode, batched=True, remove_columns=cols)

    model = AutoModelForSequenceClassification.from_pretrained(
        args.base,
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
        learning_rate=args.lr,
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
