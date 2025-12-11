/**
 * 基于统计特征的章节提取器
 * 使用文本统计特征而非固定规则，可以学习和适应不同格式
 */

export interface ChapterInfo {
  title: string;
  startIndex: number;
  endIndex: number;
  confidence: number;
}

export interface TextFeatures {
  length: number;
  hasNumbers: boolean;
  hasChineseNumbers: boolean;
  hasRomanNumerals: boolean;
  hasChapterKeywords: boolean;
  prevEmpty: boolean;
  nextEmpty: boolean;
  punctuationCount: number;
  quoteCount: number;
  isShort: boolean;
  isVeryShort: boolean;
  hasRepeatingPattern: boolean;
  positionInText: number; // 0-1
}

/**
 * 基于统计特征的章节提取器
 * 通过分析文本特征分布来识别章节，而非使用固定规则
 */
export class StatisticalChapterExtractor {
  private textFeatures: TextFeatures[] = [];
  private featureWeights: Map<keyof TextFeatures, number> = new Map();
  private adaptiveThreshold = 0.7;

  constructor() {
    this.initializeWeights();
  }

  /**
   * 初始化特征权重（可以通过训练数据学习）
   */
  private initializeWeights(): void {
    // 基于经验的特征权重
    this.featureWeights.set('isVeryShort', 0.3); // 非常短的行
    this.featureWeights.set('prevEmpty', 0.25); // 前有空行
    this.featureWeights.set('nextEmpty', 0.25); // 后有空行
    this.featureWeights.set('hasChapterKeywords', 0.4); // 章节关键词
    this.featureWeights.set('hasChineseNumbers', 0.35); // 中文数字
    this.featureWeights.set('hasRomanNumerals', 0.3); // 罗马数字
    this.featureWeights.set('hasRepeatingPattern', 0.2); // 重复模式
    this.featureWeights.set('hasNumbers', 0.15); // 数字
    this.featureWeights.set('isShort', 0.1); // 短行
    this.featureWeights.set('punctuationCount', -0.1); // 标点（负权重）
    this.featureWeights.set('quoteCount', -0.2); // 引号（负权重）
  }

  /**
   * 从训练数据中学习权重
   */
  learnFromExamples(positiveExamples: string[], negativeExamples: string[]): void {
    // 计算正样本的平均特征
    const positiveFeatures = positiveExamples.map(text => this.extractFeatures(text, 0, []));
    const negativeFeatures = negativeExamples.map(text => this.extractFeatures(text, 0, []));

    // 计算特征差异，调整权重
    const featureKeys: (keyof TextFeatures)[] = [
      'isVeryShort', 'prevEmpty', 'nextEmpty', 'hasChapterKeywords',
      'hasChineseNumbers', 'hasRomanNumerals', 'hasRepeatingPattern',
      'hasNumbers', 'isShort', 'punctuationCount', 'quoteCount'
    ];

    for (const key of featureKeys) {
      const posAvg = this.averageFeature(positiveFeatures, key);
      const negAvg = this.averageFeature(negativeFeatures, key);
      const diff = posAvg - negAvg;
      
      // 根据差异调整权重
      const currentWeight = this.featureWeights.get(key) || 0;
      this.featureWeights.set(key, currentWeight + diff * 0.5);
    }

    console.log('Learned feature weights:', Object.fromEntries(this.featureWeights));
  }

  private averageFeature(features: TextFeatures[], key: keyof TextFeatures): number {
    if (features.length === 0) return 0;
    const sum = features.reduce((acc, f) => acc + (Number(f[key]) || 0), 0);
    return sum / features.length;
  }

  /**
   * 提取文本特征
   */
  private extractFeatures(
    line: string,
    lineIndex: number,
    allLines: string[],
  ): TextFeatures {
    const trimmed = line.trim();
    const prevLine = lineIndex > 0 ? allLines[lineIndex - 1].trim() : '';
    const nextLine = lineIndex < allLines.length - 1 ? allLines[lineIndex + 1].trim() : '';

    return {
      length: trimmed.length,
      hasNumbers: /\d/.test(trimmed),
      hasChineseNumbers: /[一二三四五六七八九十百千万]/.test(trimmed),
      hasRomanNumerals: /^[IVX]+$/.test(trimmed),
      hasChapterKeywords: /第[一二三四五六七八九十百千万\d]+[章节卷部回]|Chapter\s+\d+/i.test(trimmed),
      prevEmpty: prevLine === '',
      nextEmpty: nextLine === '',
      punctuationCount: (trimmed.match(/[，。、；：？！]/g) || []).length,
      quoteCount: (trimmed.match(/[""''""]/g) || []).length,
      isShort: trimmed.length <= 50,
      isVeryShort: trimmed.length <= 20,
      hasRepeatingPattern: this.detectRepeatingPattern(trimmed, allLines),
      positionInText: lineIndex / Math.max(1, allLines.length),
    };
  }

  /**
   * 检测是否有重复模式（可能是章节标题）
   */
  private detectRepeatingPattern(line: string, allLines: string[]): boolean {
    const trimmed = line.trim();
    if (trimmed.length < 1 || trimmed.length > 30) return false;

    // 查找相似的行
    const similarCount = allLines.filter((l) => {
      const other = l.trim();
      if (other === trimmed) return false;
      return this.calculateSimilarity(trimmed, other) > 0.6;
    }).length;

    return similarCount >= 2 && similarCount <= 50;
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
   * 计算章节得分（基于特征加权）
   */
  private calculateScore(features: TextFeatures): number {
    let score = 0;

    for (const [key, weight] of this.featureWeights.entries()) {
      const value = features[key];
      if (typeof value === 'boolean') {
        score += value ? weight : 0;
      } else if (typeof value === 'number') {
        // 对于数值特征，需要归一化
        if (key === 'length') {
          // 长度特征：越短越好
          const normalized = value <= 20 ? 1 : value <= 50 ? 0.5 : 0;
          score += normalized * (weight || 0);
        } else if (key === 'punctuationCount' || key === 'quoteCount') {
          // 标点和引号：越少越好
          const normalized = value === 0 ? 1 : value <= 2 ? 0.5 : 0;
          score += normalized * (weight || 0);
        } else {
          score += value * (weight || 0);
        }
      }
    }

    // 特殊规则：明确的章节格式直接给高分
    if (features.hasChapterKeywords) {
      score = Math.max(score, 0.9);
    }

    return Math.min(1, Math.max(0, score));
  }

  /**
   * 提取章节
   */
  async extractChapters(text: string): Promise<ChapterInfo[]> {
    const lines = text.split('\n');
    const chapters: ChapterInfo[] = [];
    let currentIndex = 0;

    // 第一遍：提取所有候选章节及其特征
    const candidates: Array<{ line: string; index: number; features: TextFeatures; startIndex: number }> = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      if (!trimmed || trimmed.length > 100) {
        currentIndex += line.length + 1;
        continue;
      }

      const features = this.extractFeatures(trimmed, i, lines);
      const score = this.calculateScore(features);

      if (score > this.adaptiveThreshold) {
        const startIndex = currentIndex + line.indexOf(trimmed);
        candidates.push({
          line: trimmed,
          index: i,
          features,
          startIndex,
        });
      }

      currentIndex += line.length + 1;
    }

    // 第二遍：分析特征分布，自适应调整阈值
    if (candidates.length > 50) {
      // 如果候选太多，提高阈值
      this.adaptiveThreshold = Math.min(0.85, this.adaptiveThreshold + 0.1);
      return this.extractChapters(text); // 递归重新提取
    } else if (candidates.length < 3) {
      // 如果候选太少，降低阈值
      this.adaptiveThreshold = Math.max(0.5, this.adaptiveThreshold - 0.1);
    }

    // 转换为章节信息
    for (const candidate of candidates) {
      chapters.push({
        title: candidate.line,
        startIndex: candidate.startIndex,
        endIndex: candidate.startIndex + candidate.line.length,
        confidence: this.calculateScore(candidate.features),
      });
    }

    // 后处理：去重、排序、合并
    return this.postProcess(chapters, text);
  }

  /**
   * 后处理章节
   */
  private postProcess(chapters: ChapterInfo[], text: string): ChapterInfo[] {
    // 按位置排序
    chapters.sort((a, b) => a.startIndex - b.startIndex);

    // 去重和合并
    const merged: ChapterInfo[] = [];
    for (const chapter of chapters) {
      const lastChapter = merged[merged.length - 1];

      if (lastChapter && chapter.startIndex < lastChapter.endIndex + 200) {
        if (chapter.confidence > lastChapter.confidence + 0.1) {
          merged[merged.length - 1] = chapter;
        }
        continue;
      }

      merged.push(chapter);
    }

    // 过滤太短的章节
    const filtered = merged.filter((chapter, index) => {
      const nextChapter = merged[index + 1];
      const chapterLength = (nextChapter ? nextChapter.startIndex : text.length) - chapter.startIndex;
      return chapterLength >= 100 || chapter.confidence >= 0.9;
    });

    // 设置结束位置
    filtered.forEach((chapter, index) => {
      const nextChapter = filtered[index + 1];
      chapter.endIndex = nextChapter ? nextChapter.startIndex : text.length;
    });

    return filtered;
  }

  /**
   * 从已知章节学习（用于持续改进）
   */
  learnFromKnownChapters(text: string, knownChapters: string[]): void {
    const lines = text.split('\n');
    const positiveExamples: string[] = [];
    const negativeExamples: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line.length > 100) continue;

      if (knownChapters.some(ch => ch.trim() === line)) {
        positiveExamples.push(line);
      } else {
        negativeExamples.push(line);
      }
    }

    // 平衡样本
    const balancedNegatives = negativeExamples
      .sort(() => Math.random() - 0.5)
      .slice(0, positiveExamples.length * 2);

    this.learnFromExamples(positiveExamples, balancedNegatives);
  }
}
