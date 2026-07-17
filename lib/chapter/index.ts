import { collectCandidates } from './candidates';
import { validateCandidates } from './validate';

/**
 * 识别算法版本号。模式库或验证逻辑有实质变更时 +1，
 * 用于失效 IndexedDB 里按旧算法缓存的章节结果（手动修正的结果不受影响）。
 */
export const CHAPTER_ALGO_VERSION = 1;

export interface DetectedChapter {
  title: string;
  start: number;
  end: number;
}

/**
 * 识别置信度，驱动 P4 的模型增强决策：
 * - high：编号连贯的主模式家族，结果可直接使用
 * - medium：有主模式但序列有断裂，结果可用、可提示增强
 * - low：仅靠无编号家族或章节过少，建议模型增强或人工确认
 * - none：未识别出章节，走兜底（整本一章）
 */
export type ChapterConfidence = 'high' | 'medium' | 'low' | 'none';

export interface ChapterDetection {
  chapters: DetectedChapter[];
  confidence: ChapterConfidence;
  /** 胜出的模式家族 id，无家族胜出时为 null */
  familyId: string | null;
}

/** 无编号家族（无法做序列连贯性检查），置信度封顶 low */
const UNNUMBERED_FAMILIES = new Set(['bracket']);

/**
 * @description: 从无固定格式的 txt 文本中识别章节边界并提取标题，附带置信度信号。
 * 流程：按行生成候选（多语言模式库）→ 全局验证（编号递增序列 + 间距过滤 + 家族竞争）。
 * @param {string} text 已将换行统一为 \n 的全文
 * @return {ChapterDetection} 章节列表（end 为下一章起点或文本末尾）+ 置信度
 */
export const detectChaptersDetailed = (text: string): ChapterDetection => {
  const candidates = collectCandidates(text);
  const validation = validateCandidates(candidates, text.length);
  const chapters = validation.chapters.map((chapter, index) => ({
    title: chapter.title,
    start: chapter.start,
    end: validation.chapters[index + 1]?.start ?? text.length,
  }));
  return {
    chapters,
    confidence: resolveConfidence(chapters.length, validation.familyId, validation.contiguity),
    familyId: validation.familyId,
  };
};

/** 兼容入口：只要章节列表 */
export const detectChapters = (text: string): DetectedChapter[] => {
  return detectChaptersDetailed(text).chapters;
};

const resolveConfidence = (chapterCount: number, familyId: string | null, contiguity: number): ChapterConfidence => {
  if (chapterCount === 0) {
    return 'none';
  }
  if (familyId === null || UNNUMBERED_FAMILIES.has(familyId) || chapterCount < 3) {
    return 'low';
  }
  if (contiguity >= 0.8) {
    return 'high';
  }
  if (contiguity >= 0.5) {
    return 'medium';
  }
  return 'low';
};

export { collectCandidates } from './candidates';
export type { Candidate } from './candidates';
export { selectChapters, validateCandidates, MIN_CHAPTER_GAP } from './validate';
export type { ChapterValidation, ValidatedChapter } from './validate';
export { parseChineseNumber, parseRomanNumber, PATTERN_FAMILIES } from './patterns';
