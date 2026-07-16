import type { LabelScore } from './protocol';

/**
 * 把逐行的多标签得分映射成「是标题」的概率。
 * 行内找不到目标标签时按 0 处理（模型标签集与预期不符时宁可漏报不误报）。
 */
export const toTitleScores = (scores: LabelScore[][], positiveLabel: string): number[] => {
  return scores.map((line) => line.find((item) => item.label === positiveLabel)?.score ?? 0);
};

/**
 * transformers.js 的 text-classification 输出在单条输入时不包着数组，
 * 统一归一化为「每行一个 LabelScore[]」的形状。
 */
export const normalizeClassifierOutput = (output: unknown, lineCount: number): LabelScore[][] => {
  if (!Array.isArray(output)) {
    return [];
  }
  // 单行输入且 top_k 展开时，输出是一层 LabelScore[]
  if (lineCount === 1 && output.length > 0 && !Array.isArray(output[0])) {
    return [output as LabelScore[]];
  }
  return (output as (LabelScore | LabelScore[])[]).map((line) => (Array.isArray(line) ? line : [line]));
};
