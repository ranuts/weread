import type { PatternFamily } from './patterns';
import { PATTERN_FAMILIES } from './patterns';

/** 标题行的最大长度（去除首尾空白后），超过的行直接跳过，不做正则匹配 */
export const MAX_TITLE_LENGTH = 50;

export interface Candidate {
  familyId: string;
  special: boolean;
  /** 标题文本（整行去除首尾空白） */
  title: string;
  /** 行首在原文中的偏移 */
  start: number;
  /** 行号（0 起） */
  lineIndex: number;
  /** 从编号模式中解析出的序号，无编号家族为 null */
  seq: number | null;
}

/**
 * 按行扫描文本，生成所有家族的候选标题行。
 * 一行可能同时命中多个家族（如「一、」同时是 cn-enum），全部记录，由全局验证挑选胜出家族。
 * 文本应已将换行统一为 \n（transformText 的调用链保证了这一点），
 * 为稳妥起见此处仍兼容残留的 \r。
 */
export const collectCandidates = (text: string): Candidate[] => {
  const candidates: Candidate[] = [];
  let offset = 0;
  let lineIndex = 0;
  while (offset <= text.length) {
    const newlineIndex = text.indexOf('\n', offset);
    const lineEnd = newlineIndex === -1 ? text.length : newlineIndex;
    const rawLine = text.slice(offset, lineEnd);
    const line = rawLine.replace(/\r/g, '').trim();
    if (line.length > 0 && line.length <= MAX_TITLE_LENGTH) {
      matchLine(line, offset, lineIndex, candidates);
    }
    if (newlineIndex === -1) {
      break;
    }
    offset = newlineIndex + 1;
    lineIndex++;
  }
  return candidates;
};

const matchLine = (line: string, start: number, lineIndex: number, candidates: Candidate[]): void => {
  for (const family of PATTERN_FAMILIES) {
    const match = line.match(family.regex);
    if (!match) {
      continue;
    }
    const seq = resolveSeq(family, match);
    // 编号家族解析不出编号说明匹配质量存疑（如非法罗马数字组合），丢弃
    if (family.parseSeq && seq === null) {
      continue;
    }
    candidates.push({
      familyId: family.id,
      special: family.special === true,
      title: line,
      start,
      lineIndex,
      seq,
    });
  }
};

const resolveSeq = (family: PatternFamily, match: RegExpMatchArray): number | null => {
  if (!family.parseSeq) {
    return null;
  }
  return family.parseSeq(match);
};
