"""
把微调后的模型导出为浏览器可用的 ONNX，并做 int8 动态量化。

产出两份（对应 lib/nlp 的加载策略）:
  - full/   全量词表，桌面端，~280MB（100 语言覆盖）
  - 词表裁剪版由 prune_vocab.py 另行处理（移动端 ~150MB），本脚本先出 full

导出后目录结构符合 transformers.js 约定：model_quantized.onnx + tokenizer.json + config.json，
放到 public/models/ 或 CDN，前端 ChapterClassifier 换 modelId 即可加载。

需要在装好 optimum 的机器运行。

用法:
    pip install -r ../requirements.txt
    python3 export_onnx.py --model ../train/out/model --out out/full
"""

from __future__ import annotations

import argparse
from pathlib import Path

from optimum.onnxruntime import ORTModelForSequenceClassification, ORTQuantizer
from optimum.onnxruntime.configuration import AutoQuantizationConfig
from transformers import AutoTokenizer


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True)
    ap.add_argument("--out", default="out/full")
    args = ap.parse_args()

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    # 1. HF → ONNX
    model = ORTModelForSequenceClassification.from_pretrained(args.model, export=True)
    model.save_pretrained(out)
    AutoTokenizer.from_pretrained(args.model).save_pretrained(out)

    # 2. int8 动态量化（avx512 配置，兼容大多数 CPU；WebGPU 侧仍可用量化权重）
    quantizer = ORTQuantizer.from_pretrained(out)
    qconfig = AutoQuantizationConfig.avx512_vnni(is_static=False, per_channel=False)
    quantizer.quantize(save_dir=out, quantization_config=qconfig)

    print(f"导出完成: {out}")
    print("产物应含 model.onnx 与 model_quantized.onnx；前端默认加载 quantized。")
    print("部署: 复制到 public/models/chapter-title/ 或上传 CDN，更新 public 下模型清单 JSON。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
