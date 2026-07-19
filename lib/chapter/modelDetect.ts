import { makeModelInput } from '@/lib/nlp/features';
import type { ModelProgress } from '@/lib/nlp/protocol';
import { MAX_TITLE_LENGTH } from './candidates';
import type { DetectedChapter } from './index';

/** 句末标点：以这些结尾的行几乎不是标题，预过滤时排除（与 ml/textfeat.py TERMINAL_PUNCT 一致） */
const TERMINAL_PUNCT = new Set('。！？.!?；;：:，,、');

interface Line {
  text: string;
  start: number;
}

/** 按 \n 切成非空行（去首尾空白），记录每行在原文的偏移 */
const splitLines = (text: string): Line[] => {
  const lines: Line[] = [];
  let offset = 0;
  while (offset <= text.length) {
    const nl = text.indexOf('\n', offset);
    const end = nl === -1 ? text.length : nl;
    const t = text.slice(offset, end).replace(/\r/g, '').trim();
    if (t.length > 0) {
      lines.push({ text: t, start: offset });
    }
    if (nl === -1) {
      break;
    }
    offset = nl + 1;
  }
  return lines;
};

/** 逐行分类器：输入 makeModelInput 拼好的字符串数组，返回每行「是标题」的概率。onProgress 报推理进度。 */
export type ClassifyLines = (inputs: string[], onProgress?: (progress: ModelProgress) => void) => Promise<number[]>;

export interface ModelDetectOptions {
  /** 判为标题的概率阈值 */
  threshold?: number;
  /** 分批推理进度回调，透传给分类器 */
  onProgress?: (progress: ModelProgress) => void;
}

/**
 * @description: **纯模型**章节识别（唯一路径，不再走规则候选/结构层）。只对「像标题的短行」
 * 跑模型（够短 + 不以句末标点结尾——这是性能预过滤，非章节规则匹配；特征仍取真实前后行），
 * 概率过阈值的行即为章节标题，按位置排序，`end` 取下一标题起点。逐行分类器的召回是识别的全部来源。
 * @param {string} text 已将换行归一化为 \n 的全文
 * @param {ClassifyLines} classify 逐行分类器（来自 ChapterClassifier）
 * @return {DetectedChapter[]}
 */
export const detectChaptersWithModel = async (
  text: string,
  classify: ClassifyLines,
  options: ModelDetectOptions = {},
): Promise<DetectedChapter[]> => {
  const threshold = options.threshold ?? 0.5;
  const lines = splitLines(text);
  const total = lines.length || 1;

  // 预过滤「可能是标题的行」：够短、且不以句末标点结尾（标题几乎不以「。」结尾，
  // 这是最强特征）。把绝大多数正文行挡在模型之外，推理量从「所有短行」降到真正的标题候选。
  const candIdx: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].text;
    const last = t[t.length - 1];
    if ([...t].length <= MAX_TITLE_LENGTH && !TERMINAL_PUNCT.has(last)) {
      candIdx.push(i);
    }
  }
  const inputs = candIdx.map((i) =>
    makeModelInput({
      prev: i > 0 ? lines[i - 1].text : '',
      text: lines[i].text,
      next: i + 1 < lines.length ? lines[i + 1].text : '',
      pos: i / total,
    }),
  );

  const probs = inputs.length > 0 ? await classify(inputs, options.onProgress) : [];
  // 概率过阈值的行即章节标题——模型输出直接成章，不再 union 规则 / 过结构层。
  const titles: { title: string; start: number }[] = [];
  candIdx.forEach((i, k) => {
    if (probs[k] >= threshold) {
      titles.push({ title: lines[i].text, start: lines[i].start });
    }
  });
  titles.sort((a, b) => a.start - b.start);
  return titles.map((t, index) => ({
    title: t.title,
    start: t.start,
    end: titles[index + 1]?.start ?? text.length,
  }));
};
