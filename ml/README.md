# ml/ — 章节标题识别模型

规则层（`lib/chapter/`）在真实语料上会「打地鼠」：每放宽一条正则接住一种新格式，
就在别处放进一批假阳性。这个子项目训练一个逐行分类模型来替换规则的**候选生成层**，
学习正则学不会的语义标题（如「基辛格越战回忆录序」「累到无力抵抗」——无编号、无标记）。

## 架构定位

```
候选层：mDeBERTa 逐行「是否标题」分类   ← 本项目产出，替换规则候选层
   +   规则模式库（高精度，冻结）        ← 保留：引导标注 + 模型未加载时的兜底
结构层：多卷拼接 / 目录页剔除 / 覆盖度    ← 永远是 lib/chapter/validate.ts，模型不碰
```

模型只判断单行的「标题性」，**不做全局结构组装**——多卷本编号重启、目录页与正文区分、
章节覆盖度这些仍由 `validate.ts` 用代码完成。

## 数据来源：epub 目录 = ground truth

epub 自带结构化目录（`toc.ncx`），是**独立于规则正则**的真值标签，这解决了
「自动标注只能来自自己正则、模型只会学成正则模仿者」的死结。

当前语料（273 txt + 85 epub）中，84 本 epub 产出 **23.6 万行标注、7983 个标题正样本**，
正负比约 1:29。

## 流程

```bash
# 1. 构建数据集（只用标准库，本机即可跑）
cd data
python3 build_dataset.py /path/to/corpus --out out/dataset.jsonl
# 加 --report 只统计不写文件

# 2. 微调（需 GPU 机器；Mac 用 Apple MPS 也能跑，慢些）
#    注意：需 Python 3.11/3.12（torch 无 3.13/3.14 wheel）；本机 python3 是 3.14 时用 venv：
cd ..
python3.11 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
# 先冒烟测试确认链路通（只用少量书）：
.venv/bin/python train/train.py --data data/out/dataset.jsonl --limit 5 --epochs 1
# 再跑完整训练：
.venv/bin/python train/train.py --data data/out/dataset.jsonl --out train/out/model

# 3. 导出浏览器 ONNX（需装 optimum 的机器）
cd ../export
python3 export_onnx.py --model ../train/out/model --out out/full

# 4. 部署：把 out/full 复制到 public/models/chapter-title/，
#    前端 lib/nlp 的 ChapterClassifier 换 modelId 即可加载

# 评估规则层在语料上的当前表现（对照基线，非模型）
cd ../eval
npx tsx evalRules.ts /path/to/corpus
```

## 目录

| 路径 | 说明 | 运行环境 |
|------|------|----------|
| `data/build_dataset.py` | epub → 行级标签 JSONL | 本机（标准库） |
| `train/train.py` | mDeBERTa 逐行分类微调 | **GPU 机器** |
| `export/export_onnx.py` | ONNX 导出 + int8 量化 | 装 optimum 的机器 |
| `eval/evalRules.ts` | 规则层语料评估（对照基线） | 本机（tsx） |

## 已知待办

- 词表裁剪版（移动端 ~150MB）：`export/prune_vocab.py` 待补，按 CJK+拉丁+西里尔裁剪
- 类别不平衡（1:29）当前靠 F1 选优 + 长训练；如效果不足可换带 class_weight 的 loss
- 训练/导出脚本尚未在 GPU 机器上实跑验证；数据管线已在本机验证（84/85 epub 解析成功）
