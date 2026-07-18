import type { Candidate } from './candidates';

/** 相邻章节起点的最小间距（字符数），小于该值的候选视为误报（列表、正文引用等） */
export const MIN_CHAPTER_GAP = 200;

/** 家族权重：模式本身精度越高权重越大，噪声大的家族需要更多成员才能胜出 */
const FAMILY_WEIGHTS: Record<string, number> = {
  'cn-chapter': 1,
  'en-chapter': 1,
  'cn-enum': 0.9,
  'roman-line': 0.8,
  'num-enum': 0.7,
  bracket: 0.5,
  // 模型判出的无编号标题家族；权重高于 bracket，低于带编号的规则家族，
  // 使结构化书仍由精确的编号规则胜出，语义书才由模型家族接管
  model: 0.8,
};

export interface ValidatedChapter {
  title: string;
  start: number;
}

/** 全局验证的完整结果，familyId/contiguity 等细节供置信度评估使用 */
export interface ChapterValidation {
  chapters: ValidatedChapter[];
  /** 胜出家族，无家族胜出（仅特殊章节或识别失败）时为 null */
  familyId: string | null;
  /** 胜出家族相邻编号恰好 +1 的比例（0-1），无编号家族为 0 */
  contiguity: number;
  /** 全部候选行数（含被剔除的） */
  candidateCount: number;
}

interface FamilyResult {
  familyId: string;
  kept: Candidate[];
  contiguity: number;
  score: number;
}

/**
 * 全局验证：按家族分组竞争，编号家族用「间距过滤 + 最长递增子序列」剔除误报，
 * 选得分最高的家族作为主模式，再把特殊章节（序章/番外/后记）并入结果。
 * 没有任何家族胜出时 chapters 为空数组，由调用方走兜底逻辑。
 */
export const validateCandidates = (candidates: Candidate[], textLength: number): ChapterValidation => {
  const specials = candidates.filter((item) => item.special);
  const regulars = candidates.filter((item) => !item.special);

  const groups = new Map<string, Candidate[]>();
  for (const candidate of regulars) {
    const group = groups.get(candidate.familyId);
    if (group) {
      group.push(candidate);
    } else {
      groups.set(candidate.familyId, [candidate]);
    }
  }

  let best: FamilyResult | null = null;
  for (const [familyId, group] of groups) {
    const result = evaluateFamily(familyId, group);
    if (result && (!best || result.score > best.score)) {
      best = result;
    }
  }

  const accepted = best ? [...best.kept] : [];
  mergeSpecials(accepted, specials);

  const rejected: ChapterValidation = {
    chapters: [],
    familyId: null,
    contiguity: 0,
    candidateCount: candidates.length,
  };
  if (accepted.length < 2) {
    return rejected;
  }
  // 结果不应挤在文本的极小前缀里（如仅命中开头的目录页），要求覆盖到文本中段
  const last = accepted[accepted.length - 1];
  if (textLength > 0 && last.start < textLength * 0.3) {
    return rejected;
  }
  return {
    chapters: accepted.map((item) => ({ title: item.title, start: item.start })),
    familyId: best?.familyId ?? null,
    contiguity: best?.contiguity ?? 0,
    candidateCount: candidates.length,
  };
};

/** 兼容入口：只要章节列表 */
export const selectChapters = (candidates: Candidate[], textLength: number): ValidatedChapter[] => {
  return validateCandidates(candidates, textLength).chapters;
};

const evaluateFamily = (familyId: string, group: Candidate[]): FamilyResult | null => {
  const sorted = [...group].sort((a, b) => a.start - b.start);
  const numbered = sorted.every((item) => item.seq !== null);
  // 先做间距过滤再找递增序列：目录页的密集条目会被间距过滤压缩掉，
  // 不会先占住递增序列再被间距过滤清空、拖垮整个家族
  const spaced = filterByGap(sorted);
  const kept = numbered ? longestIncreasingRun(spaced) : spaced;
  const minCount = numbered ? 2 : 3;
  if (kept.length < minCount) {
    return null;
  }
  const contiguity = numbered ? contiguityScore(kept) : 0;
  const weight = FAMILY_WEIGHTS[familyId] ?? 0.5;
  const score = kept.length * (0.6 + 0.4 * contiguity) * weight;
  return { familyId, kept, contiguity, score };
};

/**
 * 最长严格递增子序列（按 seq），保留数量最多的自洽编号序列，剔除正文引用等离群点。
 * 长度相同时偏向位置靠后的前驱：文件开头残留的目录条目会输给正文里的真实章节行。
 */
const longestIncreasingRun = (sorted: Candidate[]): Candidate[] => {
  const n = sorted.length;
  const lengths = new Array<number>(n).fill(1);
  const prev = new Array<number>(n).fill(-1);
  let bestEnd = 0;
  for (let i = 1; i < n; i++) {
    for (let j = 0; j < i; j++) {
      if ((sorted[j].seq as number) < (sorted[i].seq as number) && lengths[j] + 1 >= lengths[i]) {
        lengths[i] = lengths[j] + 1;
        prev[i] = j;
      }
    }
    if (lengths[i] > lengths[bestEnd]) {
      bestEnd = i;
    }
  }
  const result: Candidate[] = [];
  for (let i = bestEnd; i !== -1; i = prev[i]) {
    result.push(sorted[i]);
  }
  return result.reverse();
};

/** 相邻候选间距过滤：与上一个保留项距离过近的丢弃 */
const filterByGap = (sorted: Candidate[]): Candidate[] => {
  const kept: Candidate[] = [];
  for (const candidate of sorted) {
    const last = kept[kept.length - 1];
    if (!last || candidate.start - last.start >= MIN_CHAPTER_GAP) {
      kept.push(candidate);
    }
  }
  return kept;
};

/** 相邻编号恰好 +1 的比例，衡量序列连贯性 */
const contiguityScore = (kept: Candidate[]): number => {
  if (kept.length < 2) {
    return 0;
  }
  let adjacent = 0;
  for (let i = 1; i < kept.length; i++) {
    if ((kept[i].seq as number) - (kept[i - 1].seq as number) === 1) {
      adjacent++;
    }
  }
  return adjacent / (kept.length - 1);
};

/** 把特殊章节并入结果：与已有章节起点距离足够远才接受，避免正文中孤立出现的「楔子」等词误入 */
const mergeSpecials = (accepted: Candidate[], specials: Candidate[]): void => {
  const sortedSpecials = [...specials].sort((a, b) => a.start - b.start);
  for (const special of sortedSpecials) {
    const farEnough = accepted.every((item) => Math.abs(item.start - special.start) >= MIN_CHAPTER_GAP);
    if (farEnough) {
      accepted.push(special);
    }
  }
  accepted.sort((a, b) => a.start - b.start);
};
