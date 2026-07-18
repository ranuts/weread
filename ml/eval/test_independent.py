"""
独立测试集评估：用训练零接触的中文 txt（literature-books-master 里的 .txt，
训练只用了该目录的 .epub 与英文 txt）做干净的泛化测试。

标签来自高精度规则（只收章节序列清晰的书，第X章递增序列无歧义 = 可靠 gold），
因此本测试覆盖「结构化中文书」的泛化；纯语义标题的效果另在 app 里定性验证。

与验证集的区别：这些书既不在训练集、也不参与 load_best_model 的模型选择，
是完全独立的第三方数据，回答「0.96 是不是模型选择带来的乐观」。

用法:
    .venv/bin/python eval/test_independent.py --model train/out/model_v2 --corpus /path/to/literature-books-master
"""

from __future__ import annotations

import argparse
import sys
import warnings
from pathlib import Path

warnings.filterwarnings("ignore")
import numpy as np
import torch
from transformers import AutoModelForSequenceClassification, AutoTokenizer

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from data.build_dataset import parse_txt_weak  # noqa: E402
from textfeat import make_text  # noqa: E402

MAX_LEN = 128


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True)
    ap.add_argument("--corpus", required=True, help="含中文 txt 的目录（训练未使用其 txt）")
    ap.add_argument("--batch", type=int, default=64)
    ap.add_argument("--max-books", type=int, default=40)
    args = ap.parse_args()

    # 组装独立测试集（规则可靠标注的书）
    txts = sorted(Path(args.corpus).rglob("*.txt"))
    records: list[dict] = []
    books = 0
    for path in txts:
        if books >= args.max_books:
            break
        recs = parse_txt_weak(path, f"test:{path.stem}")
        if recs is None:
            continue
        books += 1
        records.extend(recs)
    labels = np.array([r["label"] for r in records])
    print(f"独立测试集: {books} 本训练零接触的中文书, {len(records)} 行, 正样本 {int(labels.sum())}")

    device = "mps" if torch.backends.mps.is_available() else "cpu"
    tok = AutoTokenizer.from_pretrained(args.model)
    model = AutoModelForSequenceClassification.from_pretrained(args.model).to(device).eval()

    probs = np.zeros(len(records), dtype=np.float32)
    for i in range(0, len(records), args.batch):
        batch = records[i : i + args.batch]
        enc = tok([make_text(r) for r in batch], return_tensors="pt", truncation=True, max_length=MAX_LEN, padding=True)
        enc = {k: v.to(device) for k, v in enc.items()}
        with torch.no_grad():
            logits = model(**enc).logits
        probs[i : i + len(batch)] = torch.softmax(logits, dim=-1)[:, 1].cpu().numpy()
        if i % (args.batch * 30) == 0:
            print(f"  推理 {i}/{len(records)}", flush=True)

    print("\n阈值    precision  recall   f1")
    for thr in [0.5, 0.4, 0.3, 0.2, 0.1]:
        pred = probs >= thr
        tp = int((pred & (labels == 1)).sum())
        fp = int((pred & (labels == 0)).sum())
        fn = int((~pred & (labels == 1)).sum())
        prec = tp / (tp + fp) if tp + fp else 0.0
        rec = tp / (tp + fn) if tp + fn else 0.0
        f1 = 2 * prec * rec / (prec + rec) if prec + rec else 0.0
        print(f"{thr:.2f}    {prec:.3f}     {rec:.3f}   {f1:.3f}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
