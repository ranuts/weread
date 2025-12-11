import type { ChapterItem } from './transformText';
import { TFJSChapterExtractor, type ChapterInfo as TFJSChapterInfo } from './tfjsChapterExtractor';
import { EnhancedAIChapterExtractor, type EnhancedAIConfig } from './enhancedAIChapterExtractor';

export interface AIChapterExtractorOptions {
  useLocalModel?: boolean;
  useEnhancedModel?: boolean; // 使用增强的 ONNX 模型
  confidenceThreshold?: number;
  maxChapters?: number;
  tfjsConfig?: {
    modelPath?: string;
    threshold?: number;
    maxLength?: number;
    batchSize?: number;
    vocabSize?: number;
  };
  enhancedConfig?: Partial<EnhancedAIConfig>;
}

export class AIChapterExtractor {
  private options: Required<Omit<AIChapterExtractorOptions, 'tfjsConfig' | 'enhancedConfig'>> & {
    tfjsConfig?: AIChapterExtractorOptions['tfjsConfig'];
    enhancedConfig?: AIChapterExtractorOptions['enhancedConfig'];
  };
  private tfjsExtractor: TFJSChapterExtractor | null = null;
  private enhancedExtractor: EnhancedAIChapterExtractor | null = null;

  constructor(options: AIChapterExtractorOptions = {}) {
    this.options = {
      useLocalModel: true,
      useEnhancedModel: true, // 默认使用增强模型
      confidenceThreshold: 0.7,
      maxChapters: 100,
      tfjsConfig: {
        modelPath: '/weread/models/chapter_classifier.json',
        threshold: 0.7,
        maxLength: 128,
        batchSize: 32,
        vocabSize: 1000,
      },
      enhancedConfig: {},
      ...options,
    };
  }

  async initialize(): Promise<void> {
    // 优先使用增强的 ONNX 模型
    if (this.options.useEnhancedModel) {
      this.enhancedExtractor = new EnhancedAIChapterExtractor({
        threshold: this.options.confidenceThreshold,
        ...this.options.enhancedConfig,
      });
      await this.enhancedExtractor.initialize();
    } else if (this.options.useLocalModel) {
      this.tfjsExtractor = new TFJSChapterExtractor(this.options.tfjsConfig);
      await this.tfjsExtractor.initialize();
    }
  }

  async extractChapters(text: string): Promise<ChapterItem[]> {
    if (!text.trim()) {
      return [];
    }

    try {
      // 优先使用增强的 ONNX 模型
      if (this.enhancedExtractor) {
        const enhancedChapters = await this.extractChaptersWithEnhanced(text);
        if (enhancedChapters.length > 0) {
          return enhancedChapters;
        }
      }

      // 回退到 TensorFlow.js 模型
      if (this.tfjsExtractor) {
        const tfjsChapters = await this.extractChaptersWithTFJS(text);
        if (tfjsChapters.length > 0) {
          return tfjsChapters;
        }
      }

      // 最后使用启发式方法
      return this.extractChaptersWithHeuristics(text);
    } catch (error) {
      console.warn('AI chapter extraction failed, using heuristic method only:', error);
      return this.extractChaptersWithHeuristics(text);
    }
  }

  /**
   * 使用增强的 ONNX 模型提取章节
   */
  private async extractChaptersWithEnhanced(text: string): Promise<ChapterItem[]> {
    if (!this.enhancedExtractor) {
      return [];
    }

    try {
      const enhancedChapters = await this.enhancedExtractor.extractChapters(text);

      // 转换为 ChapterItem 格式
      return enhancedChapters.map((chapter) => ({
        title: chapter.title,
        start: chapter.startIndex,
        end: chapter.endIndex,
        confidence: chapter.confidence,
      }));
    } catch (error) {
      console.warn('Enhanced AI chapter extraction failed:', error);
      return [];
    }
  }

  /**
   * 使用 TensorFlow.js 模型提取章节
   */
  private async extractChaptersWithTFJS(text: string): Promise<ChapterItem[]> {
    if (!this.tfjsExtractor) {
      return [];
    }

    try {
      const tfjsChapters = await this.tfjsExtractor.extractChapters(text);

      // 转换为 ChapterItem 格式
      return tfjsChapters.map((chapter: TFJSChapterInfo) => ({
        title: chapter.title,
        start: chapter.startIndex,
        end: chapter.endIndex,
        confidence: chapter.confidence,
      }));
    } catch (error) {
      console.warn('TensorFlow.js chapter extraction failed, falling back to traditional method:', error);
      return [];
    }
  }

  /**
   * 提取文本特征
   */
  private extractTextFeatures(text: string) {
    const lines = text.split('\n');

    return {
      totalLines: lines.length,
      averageLineLength: lines.reduce((sum, line) => sum + line.length, 0) / lines.length,
      shortLines: lines.filter((line) => line.length < 50).length,
      longLines: lines.filter((line) => line.length > 100).length,
      emptyLines: lines.filter((line) => line.trim() === '').length,
      numberPatterns: this.findNumberPatterns(text),
      specialPatterns: this.findSpecialPatterns(text),
    };
  }

  /**
   * 基于启发式规则的章节识别
   */
  private extractChaptersWithHeuristics(text: string): ChapterItem[] {
    const chapters: ChapterItem[] = [];
    const lines = text.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // 跳过空行
      if (!line) continue;

      // 检查是否是章节标题的特征
      if (this.isLikelyChapterTitle(line, i, lines)) {
        const startIndex = text.indexOf(line, i > 0 ? text.indexOf(lines[i - 1]) + lines[i - 1].length : 0);

        chapters.push({
          title: line,
          start: startIndex,
          end: undefined,
        });
      }
    }

    // 设置结束位置
    chapters.forEach((chapter, index) => {
      const nextChapter = chapters[index + 1];
      chapter.end = nextChapter ? nextChapter.start : text.length;
    });

    return chapters;
  }

  /**
   * 判断一行是否可能是章节标题
   */
  private isLikelyChapterTitle(line: string, lineIndex: number, allLines: string[]): boolean {
    // 1. 长度检查 - 章节标题通常不会太长
    if (line.length > 100) return false;

    // 2. 数字模式检查
    if (/\d+/.test(line) && line.length < 50) {
      return true;
    }

    // 3. 特殊字符检查
    if (/[*\-=]{3,}/.test(line)) {
      return true;
    }

    // 4. 位置检查 - 章节标题通常在段落开始
    if (lineIndex > 0) {
      const prevLine = allLines[lineIndex - 1].trim();
      if (prevLine === '' && line.length < 80) {
        return true;
      }
    }

    // 5. 重复模式检查 - 如果发现类似的模式
    const similarLines = allLines.filter(
      (l) => l.trim().length > 10 && l.trim().length < 80 && this.calculateSimilarity(line, l.trim()) > 0.3,
    );

    if (similarLines.length > 2) {
      return true;
    }

    return false;
  }

  /**
   * 计算两行文本的相似度
   */
  private calculateSimilarity(line1: string, line2: string): number {
    const set1 = new Set(line1.split(''));
    const set2 = new Set(line2.split(''));

    const intersection = new Set([...set1].filter((x) => set2.has(x)));
    const union = new Set([...set1, ...set2]);

    return intersection.size / union.size;
  }

  /**
   * 查找数字模式
   */
  private findNumberPatterns(text: string): string[] {
    const patterns: string[] = [];
    const numberRegex = /\d+/g;
    let match;

    while ((match = numberRegex.exec(text)) !== null) {
      patterns.push(match[0]);
    }

    return patterns;
  }

  /**
   * 查找特殊模式
   */
  private findSpecialPatterns(text: string): string[] {
    const patterns: string[] = [];
    const specialRegex = /[*\-=]{3,}/g;
    let match;

    while ((match = specialRegex.exec(text)) !== null) {
      patterns.push(match[0]);
    }

    return patterns;
  }

  /**
   * 判断是否应该使用 AI
   */
  private shouldUseAI(traditionalChapters: ChapterItem[], text: string): boolean {
    // 如果传统方法找到的章节太少，使用 AI
    if (traditionalChapters.length < 3) {
      return true;
    }

    // 如果文本很长但章节很少，使用 AI
    if (text.length > 10000 && traditionalChapters.length < 10) {
      return true;
    }

    // 如果章节分布不均匀，使用 AI
    const avgChapterLength = text.length / (traditionalChapters.length + 1);
    const hasUnevenDistribution = traditionalChapters.some((chapter, index) => {
      const nextChapter = traditionalChapters[index + 1];
      if (!nextChapter) return false;

      const chapterLength = nextChapter.start - chapter.start;
      return chapterLength > avgChapterLength * 3 || chapterLength < avgChapterLength * 0.3;
    });

    return hasUnevenDistribution;
  }

  /**
   * 合并传统方法和 AI 方法的结果
   */
  private mergeResults(traditional: ChapterItem[], ai: ChapterItem[], text: string): ChapterItem[] {
    // 如果 AI 方法没有找到章节，返回传统方法的结果
    if (ai.length === 0) {
      return traditional;
    }

    // 如果传统方法没有找到章节，返回 AI 方法的结果
    if (traditional.length === 0) {
      return ai;
    }

    // 合并两种方法的结果
    const allChapters = [...traditional, ...ai];

    // 按位置排序
    allChapters.sort((a, b) => a.start - b.start);

    // 去重和合并
    const merged: ChapterItem[] = [];
    for (const chapter of allChapters) {
      const lastChapter = merged[merged.length - 1];

      if (!lastChapter || chapter.start > lastChapter.start + 100) {
        merged.push(chapter);
      } else if (
        typeof chapter.confidence === 'number' &&
        typeof lastChapter.confidence === 'number' &&
        chapter.confidence > lastChapter.confidence
      ) {
        // 如果新章节置信度更高，替换旧的
        merged[merged.length - 1] = chapter;
      }
    }

    // 设置结束位置
    merged.forEach((chapter, index) => {
      const nextChapter = merged[index + 1];
      chapter.end = nextChapter ? nextChapter.start : text.length;
    });

    return merged.slice(0, this.options.maxChapters);
  }

  /**
   * 清理资源
   */
  async dispose(): Promise<void> {
    if (this.enhancedExtractor) {
      await this.enhancedExtractor.dispose();
      this.enhancedExtractor = null;
    }
    if (this.tfjsExtractor) {
      await this.tfjsExtractor.dispose();
      this.tfjsExtractor = null;
    }
  }
}

// 导出便捷函数
export const extractChaptersWithAI = async (
  text: string,
  options?: AIChapterExtractorOptions,
): Promise<ChapterItem[]> => {
  const extractor = new AIChapterExtractor(options);
  try {
    return await extractor.extractChapters(text);
  } finally {
    await extractor.dispose();
  }
};
