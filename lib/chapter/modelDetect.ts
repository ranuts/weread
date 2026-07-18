import { makeModelInput } from '@/lib/nlp/features';
import { collectCandidates, MAX_TITLE_LENGTH } from './candidates';
import type { Candidate } from './candidates';
import { validateCandidates } from './validate';
import type { DetectedChapter } from './index';

/** 模型判出的标题构成一个无编号家族，与规则家族一起竞争，交 validate 结构层过滤 */
export const MODEL_FAMILY_ID = 'model';

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

/** 逐行分类器：输入 makeModelInput 拼好的字符串数组，返回每行「是标题」的概率 */
export type ClassifyLines = (inputs: string[]) => Promise<number[]>;

export interface ModelDetectOptions {
  /** 判为标题的概率阈值 */
  threshold?: number;
}

/**
 * @description: 模型增强的章节识别。只对「像标题的短行」跑模型（省算力，特征仍取真实前后行），
 * 模型判出的标题作为一个无编号家族，与规则候选 union 后交 `validate.ts` 结构层过滤
 * （家族竞争 / 间距 / 覆盖度）。结构化书规则家族胜出（更精确），语义书模型家族胜出。
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

  const probs = inputs.length > 0 ? await classify(inputs) : [];
  const modelCands: Candidate[] = [];
  candIdx.forEach((i, k) => {
    if (probs[k] >= threshold) {
      modelCands.push({
        familyId: MODEL_FAMILY_ID,
        special: false,
        title: lines[i].text,
        start: lines[i].start,
        lineIndex: i,
        seq: null,
      });
    }
  });

  // union 规则候选 → 结构层过滤（家族竞争选出规则或模型家族）
  const all = [...collectCandidates(text), ...modelCands];
  const validation = validateCandidates(all, text.length);
  return validation.chapters.map((chapter, index) => ({
    title: chapter.title,
    start: chapter.start,
    end: validation.chapters[index + 1]?.start ?? text.length,
  }));
};
