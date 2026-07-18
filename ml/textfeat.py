"""
行级格式特征 → 模型输入字符串。训练、评估、导出共用此单一实现。

**前端 lib/nlp 必须逐字复刻 feat_tokens / make_text 的逻辑**，否则训练与推理特征不一致，
模型效果会崩。改这里就要同步改前端（见 lib/nlp/features.ts）。
"""

# 句末标点：标题几乎不以这些结尾（最强的负向信号之一）
TERMINAL_PUNCT = "。！？.!?；;：:，,、"


def feat_tokens(text: str, prev: str, nxt: str, pos: float) -> str:
    """
    - L0-3  行长分桶（标题短）
    - P0/1  是否以句末标点结尾（标题通常不以「。」结尾）
    - Q0-3  在全书的位置四分位
    - NX0/1 下一行是否明显更长（短标题后接长正文段）
    - PV0/1 上一行是否明显更长
    """
    n = len(text)
    length = "L0" if n <= 6 else "L1" if n <= 12 else "L2" if n <= 25 else "L3"
    term = "P1" if text and text[-1] in TERMINAL_PUNCT else "P0"
    quart = "Q0" if pos < 0.25 else "Q1" if pos < 0.5 else "Q2" if pos < 0.75 else "Q3"
    nx = "NX1" if len(nxt) - n >= 10 else "NX0"
    pv = "PV1" if len(prev) - n >= 10 else "PV0"
    return f"{length} {term} {quart} {nx} {pv}"


def make_text(rec: dict) -> str:
    feats = feat_tokens(rec["text"], rec.get("prev", ""), rec.get("next", ""), float(rec.get("pos", 0.5)))
    return f"{feats} [SEP] {rec.get('prev', '')} [SEP] {rec['text']} [SEP] {rec.get('next', '')}"
