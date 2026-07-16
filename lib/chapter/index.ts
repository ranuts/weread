import { collectCandidates } from './candidates';
import { selectChapters } from './validate';

export interface DetectedChapter {
  title: string;
  start: number;
  end: number;
}

/**
 * @description: 从无固定格式的 txt 文本中识别章节边界并提取标题。
 * 流程：按行生成候选（多语言模式库）→ 全局验证（编号递增序列 + 间距过滤 + 家族竞争）。
 * 无法可靠识别时返回空数组，调用方应走兜底逻辑（整本一章或按空行分块）。
 * @param {string} text 已将换行统一为 \n 的全文
 * @return {DetectedChapter[]} 按出现顺序排列的章节，end 为下一章起点或文本末尾
 */
export const detectChapters = (text: string): DetectedChapter[] => {
  const candidates = collectCandidates(text);
  const selected = selectChapters(candidates, text.length);
  return selected.map((chapter, index) => ({
    title: chapter.title,
    start: chapter.start,
    end: selected[index + 1]?.start ?? text.length,
  }));
};

export { collectCandidates } from './candidates';
export type { Candidate } from './candidates';
export { selectChapters, MIN_CHAPTER_GAP } from './validate';
export { parseChineseNumber, parseRomanNumber, PATTERN_FAMILIES } from './patterns';
