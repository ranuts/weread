/**
 * 行级格式特征 → 模型输入字符串。
 *
 * ⚠️ 此文件必须与训练侧 ml/textfeat.py 的 feat_tokens / make_text 逐字一致，
 * 否则训练与推理的特征不匹配，模型效果会崩。改动务必两侧同步。
 */

/** 句末标点：标题几乎不以这些结尾（与 ml/textfeat.py TERMINAL_PUNCT 一致） */
const TERMINAL_PUNCT = '。！？.!?；;：:，,、';

export interface LineContext {
  prev: string;
  text: string;
  next: string;
  /** 行在全书的位置（0-1），= 行号 / 总行数 */
  pos: number;
}

/**
 * 与 ml/textfeat.py feat_tokens 对应：
 * - L0-3  行长分桶（标题短）
 * - P0/1  是否以句末标点结尾（标题通常不以「。」结尾）
 * - Q0-3  在全书的位置四分位
 * - NX0/1 下一行是否明显更长（短标题后接长正文段）
 * - PV0/1 上一行是否明显更长
 *
 * 注意：Python 的 len(str) 按 Unicode 码点计数；JS 用 [...str].length 与之一致
 * （String.length 按 UTF-16 码元，emoji 等会不一致）。
 */
export const featTokens = (ctx: LineContext): string => {
  const n = [...ctx.text].length;
  const length = n <= 6 ? 'L0' : n <= 12 ? 'L1' : n <= 25 ? 'L2' : 'L3';
  const last = ctx.text.length > 0 ? ctx.text[ctx.text.length - 1] : '';
  const term = last && TERMINAL_PUNCT.includes(last) ? 'P1' : 'P0';
  const quart = ctx.pos < 0.25 ? 'Q0' : ctx.pos < 0.5 ? 'Q1' : ctx.pos < 0.75 ? 'Q2' : 'Q3';
  const nx = [...ctx.next].length - n >= 10 ? 'NX1' : 'NX0';
  const pv = [...ctx.prev].length - n >= 10 ? 'PV1' : 'PV0';
  return `${length} ${term} ${quart} ${nx} ${pv}`;
};

/** 与 ml/textfeat.py make_text 对应：特征 token + 上下文窗口 */
export const makeModelInput = (ctx: LineContext): string => {
  return `${featTokens(ctx)} [SEP] ${ctx.prev} [SEP] ${ctx.text} [SEP] ${ctx.next}`;
};

/**
 * 把整篇文本的行序列转成模型输入。空行不进入候选（与训练侧一致：训练只保留非空行），
 * 但用于判断相邻行是否更长时，取的是「非空行序列」里的前后行。
 */
export const buildModelInputs = (nonEmptyLines: string[]): string[] => {
  const total = nonEmptyLines.length || 1;
  return nonEmptyLines.map((text, i) =>
    makeModelInput({
      prev: i > 0 ? nonEmptyLines[i - 1] : '',
      text,
      next: i + 1 < nonEmptyLines.length ? nonEmptyLines[i + 1] : '',
      pos: i / total,
    }),
  );
};
