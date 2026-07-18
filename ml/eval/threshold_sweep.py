"""
在自然分布验证集上扫描判定阈值，给出精度-召回曲线。

模型输出接的是 validate.ts 结构层（能清假阳性），所以可以用更低阈值换更高召回。
本脚本只做一次推理，之后在内存里扫阈值，回答「阈值定在哪、召回能到多少、精度代价多大」。

用法:
    .venv/bin/python eval/threshold_sweep.py --model train/out/model --data data/out/dataset.jsonl
"""

from __future__ import annotations

import argparse
import json
import warnings
from pathlib import Path

warnings.filterwarnings("ignore")
import numpy as np
import torch
from transformers import AutoModelForSequenceClassification, AutoTokenizer

MAX_LEN = 128


def load_records(path: Path) -> list[dict]:
    with path.open(encoding="utf-8") as f:
        return [json.loads(line) for line in f]


def dedupe(records: list[dict]) -> list[dict]:
    seen = set()
    out = []
    for r in records:
        key = (r["text"], r["label"])
        if key not in seen:
            seen.add(key)
            out.append(r)
    return out


def dev_split(records: list[dict], holdout_frac: float = 0.15) -> list[dict]:
    """复现 train.py 的按书划分，取同一批 held-out 书。"""
    books = sorted({r["book"] for r in records})
    cut = int(len(books) * (1 - holdout_frac))
    dev_books = set(books[cut:])
    return [r for r in records if r["book"] in dev_books]


def make_text(r: dict) -> str:
    return f"{r.get('prev', '')} [SEP] {r['text']} [SEP] {r.get('next', '')}"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True)
    ap.add_argument("--data", required=True)
    ap.add_argument("--batch", type=int, default=64)
    ap.add_argument("--limit", type=int, default=0, help="只评估前 N 行 dev（调试用）")
    args = ap.parse_args()

    device = "mps" if torch.backends.mps.is_available() else "cpu"
    tok = AutoTokenizer.from_pretrained(args.model)
    model = AutoModelForSequenceClassification.from_pretrained(args.model).to(device).eval()

    dev = dev_split(dedupe(load_records(Path(args.data))))
    if args.limit:
        dev = dev[: args.limit]
    labels = np.array([r["label"] for r in dev])
    print(f"验证集 {len(dev)} 行，正样本 {int(labels.sum())} (占比 {labels.mean() * 100:.2f}%)")

    probs = np.zeros(len(dev), dtype=np.float32)
    for i in range(0, len(dev), args.batch):
        batch = dev[i : i + args.batch]
        enc = tok([make_text(r) for r in batch], return_tensors="pt", truncation=True, max_length=MAX_LEN, padding=True)
        enc = {k: v.to(device) for k, v in enc.items()}
        with torch.no_grad():
            logits = model(**enc).logits
        probs[i : i + len(batch)] = torch.softmax(logits, dim=-1)[:, 1].cpu().numpy()
        if i % (args.batch * 20) == 0:
            print(f"  推理 {i}/{len(dev)}", flush=True)

    print("\n阈值    precision  recall   f1     判为标题数")
    best = (0.0, 0.0)
    for thr in [0.5, 0.4, 0.35, 0.3, 0.25, 0.2, 0.15, 0.1, 0.05]:
        pred = probs >= thr
        tp = int((pred & (labels == 1)).sum())
        fp = int((pred & (labels == 0)).sum())
        fn = int((~pred & (labels == 1)).sum())
        prec = tp / (tp + fp) if tp + fp else 0.0
        rec = tp / (tp + fn) if tp + fn else 0.0
        f1 = 2 * prec * rec / (prec + rec) if prec + rec else 0.0
        if f1 > best[1]:
            best = (thr, f1)
        print(f"{thr:.2f}    {prec:.3f}     {rec:.3f}   {f1:.3f}   {int(pred.sum())}")
    print(f"\n最佳 f1 阈值 {best[0]:.2f} (f1={best[1]:.3f})")
    print("提示：结构层能清假阳性，实际可选比最佳-f1 更低的阈值以拿更高召回")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
