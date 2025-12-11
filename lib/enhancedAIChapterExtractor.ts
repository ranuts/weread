import * as ort from 'onnxruntime-web';
import { StatisticalChapterExtractor } from './statisticalChapterExtractor';

export interface EnhancedAIConfig {
  modelPath: string;
  threshold: number;
  maxLength: number;
  batchSize: number;
  useContextFeatures?: boolean; // 是否使用上下文特征
}

export interface ChapterInfo {
  title: string;
  startIndex: number;
  endIndex: number;
  confidence: number;
}

/**
 * 增强的基于文本的 AI 章节提取器
 * 使用 ONNX Runtime，支持上下文特征和持续训练
 */
export class EnhancedAIChapterExtractor {
  private session: ort.InferenceSession | null = null;
  private config: Required<EnhancedAIConfig>;
  private tokenizer: EnhancedTokenizer;
  private isInitialized = false;

  constructor(config: Partial<EnhancedAIConfig> = {}) {
    this.config = {
      modelPath: '/weread/models/chapter_classifier.onnx',
      threshold: 0.7,
      maxLength: 256, // 增加长度以支持更多上下文
      batchSize: 32,
      useContextFeatures: true,
      ...config,
    };
    this.tokenizer = new EnhancedTokenizer();
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // 初始化 ONNX Runtime
      // eslint-disable-next-line n/no-unsupported-features/node-builtins
      ort.env.wasm.numThreads = navigator.hardwareConcurrency || 4;
      ort.env.wasm.simd = true;

      // 检查模型文件是否存在
      const modelExists = await this.checkModelExists();
      if (!modelExists) {
        console.log('Model file not found, will use fallback method');
        this.isInitialized = false;
        return;
      }

      // 尝试加载模型
      this.session = await ort.InferenceSession.create(this.config.modelPath);
      this.isInitialized = true;

      console.log('Enhanced AI Chapter Extractor initialized successfully');
    } catch (_error) {
      console.warn('Failed to initialize enhanced AI model, will use fallback method:', _error);
      this.isInitialized = false;
    }
  }

  private async checkModelExists(): Promise<boolean> {
    try {
      const response = await fetch(this.config.modelPath, { method: 'HEAD' });
      return response.ok;
    } catch (_error) {
      return false;
    }
  }

  /**
   * 提取章节，使用增强的文本特征
   */
  async extractChapters(text: string): Promise<ChapterInfo[]> {
    if (!this.isInitialized || !this.session) {
      return this.fallbackExtraction(text);
    }

    try {
      const lines = text.split('\n');
      const chapters: ChapterInfo[] = [];

      // 使用上下文特征提取候选章节
      const candidates = this.extractCandidatesWithContext(lines, text);

      // 分批处理以提高性能
      for (let i = 0; i < candidates.length; i += this.config.batchSize) {
        const batch = candidates.slice(i, i + this.config.batchSize);
        const predictions = await this.predictBatch(batch);

        for (let j = 0; j < batch.length; j++) {
          const candidate = batch[j];
          const confidence = predictions[j];

          if (confidence > this.config.threshold) {
            chapters.push({
              title: candidate.line.trim(),
              startIndex: candidate.startIndex,
              endIndex: candidate.endIndex,
              confidence,
            });
          }
        }
      }

      return this.postProcessChapters(chapters, text);
    } catch (_error) {
      console.warn('Enhanced AI prediction failed, falling back to method:', _error);
      return this.fallbackExtraction(text);
    }
  }

  /**
   * 使用上下文提取候选章节
   */
  private extractCandidatesWithContext(
    lines: string[],
    _text: string,
  ): Array<{ line: string; startIndex: number; endIndex: number; context: string }> {
    const candidates: Array<{ line: string; startIndex: number; endIndex: number; context: string }> = [];
    let currentIndex = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();

      // 跳过空行和过长的行
      if (!trimmedLine || trimmedLine.length > 200) {
        currentIndex += line.length + 1; // +1 for newline
        continue;
      }

      // 构建上下文特征
      const prevLine = i > 0 ? lines[i - 1].trim() : '';
      const nextLine = i < lines.length - 1 ? lines[i + 1].trim() : '';
      const hasPrevEmpty = i > 0 && lines[i - 1].trim() === '';
      const hasNextEmpty = i < lines.length - 1 && lines[i + 1].trim() === '';

      // 构建包含上下文的特征字符串
      let context = '';
      if (this.config.useContextFeatures) {
        context = `${hasPrevEmpty ? '[EMPTY]' : prevLine.slice(-20)} | ${trimmedLine} | ${hasNextEmpty ? '[EMPTY]' : nextLine.slice(0, 20)}`;
      } else {
        context = trimmedLine;
      }

      const startIndex = currentIndex + line.indexOf(trimmedLine);
      const endIndex = startIndex + trimmedLine.length;

      candidates.push({
        line: trimmedLine,
        startIndex,
        endIndex,
        context,
      });

      currentIndex += line.length + 1;
    }

    return candidates;
  }

  /**
   * 批量预测
   */
  private async predictBatch(
    candidates: Array<{ line: string; context: string }>,
  ): Promise<number[]> {
    if (!this.session) throw new Error('Model not initialized');

    const inputs: number[][] = [];

    for (const candidate of candidates) {
      // 使用上下文特征或原始行
      const textToTokenize = this.config.useContextFeatures ? candidate.context : candidate.line;
      const tokens = this.tokenizer.tokenize(textToTokenize, this.config.maxLength);
      inputs.push(tokens);
    }

    // 转换为 ONNX 格式
    const flatInputs = inputs.flat().map((x) => BigInt(x));
    const inputTensor = new ort.Tensor('int64', new BigInt64Array(flatInputs as bigint[]), [
      inputs.length,
      this.config.maxLength,
    ]);

    const feeds = { input: inputTensor };
    const results = await this.session.run(feeds);

    const output = results.output.data as Float32Array;
    const predictions: number[] = [];

    // 假设模型输出 [not_chapter_prob, chapter_prob]
    for (let i = 0; i < candidates.length; i++) {
      predictions.push(output[i * 2 + 1]);
    }

    // 清理内存
    inputTensor.dispose();

    return predictions;
  }

  /**
   * 后处理章节：去重、排序、合并
   */
  private postProcessChapters(chapters: ChapterInfo[], text: string): ChapterInfo[] {
    // 按位置排序
    chapters.sort((a, b) => a.startIndex - b.startIndex);

    // 去重和合并
    const merged: ChapterInfo[] = [];
    for (const chapter of chapters) {
      const lastChapter = merged[merged.length - 1];

      // 如果距离太近，选择置信度更高的
      if (lastChapter && chapter.startIndex < lastChapter.endIndex + 200) {
        if (chapter.confidence > lastChapter.confidence + 0.1) {
          // 只有置信度明显更高时才替换
          merged[merged.length - 1] = chapter;
        }
        continue;
      }

      merged.push(chapter);
    }

    // 过滤掉明显不合理的章节
    const filtered = merged.filter((chapter, index) => {
      // 检查章节长度是否合理（至少几百字符）
      const nextChapter = merged[index + 1];
      const chapterLength = (nextChapter ? nextChapter.startIndex : text.length) - chapter.startIndex;
      
      // 如果章节太短（小于 100 字符），可能是误识别
      if (chapterLength < 100 && chapter.confidence < 0.9) {
        return false;
      }

      return true;
    });

    // 设置结束位置
    filtered.forEach((chapter, index) => {
      const nextChapter = filtered[index + 1];
      chapter.endIndex = nextChapter ? nextChapter.startIndex : text.length;
    });

    return filtered;
  }

  /**
   * 后备提取方法（当模型不可用时）
   * 使用基于统计特征的方法，而非固定规则
   */
  private async fallbackExtraction(text: string): Promise<ChapterInfo[]> {
    // 使用统计特征提取器作为后备
    // 这是基于文本特征的统计方法，可以通过学习改进
    const statisticalExtractor = new StatisticalChapterExtractor();
    return await statisticalExtractor.extractChapters(text);
  }

  /**
   * 使用更严格的过滤条件重新提取（已废弃，使用统计方法）
   */
  private async fallbackExtractionWithStrictFilter(text: string): Promise<ChapterInfo[]> {
    // 直接使用统计方法
    const statisticalExtractor = new StatisticalChapterExtractor();
    return await statisticalExtractor.extractChapters(text);
  }

  /**
   * 判断一行是否绝对不是章节标题
   */
  private isDefinitelyNotChapter(line: string, lineIndex: number, allLines: string[]): boolean {
    // 1. 过长或过短
    if (line.length < 1 || line.length > 100) return true;

    // 2. 包含对话标记（引号、冒号等）
    const quoteChars = ['"', '"', "'", "'", '"', '"'];
    const hasQuotes = quoteChars.some(char => line.includes(char));
    if (hasQuotes && line.length > 20) {
      // 检查是否包含成对的引号（可能是对话）
      const quoteCount = quoteChars.reduce((count, char) => count + (line.split(char).length - 1), 0);
      if (quoteCount >= 2) return true;
    }
    if (line.includes('：') && line.length > 15 && !/^第/.test(line)) return true;
    if (line.includes('：') && line.includes('说')) return true;

    // 3. 包含常见正文特征
    if (line.includes('，') && line.length > 30) return true; // 长句通常不是章节
    if (line.includes('。') && line.length > 30) return true;
    if (line.includes('、') && line.length > 20 && !/^[一二三四五六七八九十]+、/.test(line)) return true;

    // 4. 包含常见非章节词汇
    const nonChapterKeywords = [
      '回答', '说道', '说道', '说道', '说道', '说道', '说道', '说道', '说道', '说道',
      '给我', '请你', '好吗', '好吗', '好吗', '好吗', '好吗', '好吗', '好吗', '好吗',
      '不要', '想要', '想要', '想要', '想要', '想要', '想要', '想要', '想要', '想要',
      '住在', '住在', '住在', '住在', '住在', '住在', '住在', '住在', '住在', '住在',
      '记得', '记得', '记得', '记得', '记得', '记得', '记得', '记得', '记得', '记得',
    ];
    if (nonChapterKeywords.some(keyword => line.includes(keyword) && line.length > 15)) return true;

    // 5. 包含多个标点符号（通常是正文）
    const punctuationCount = (line.match(/[，。、；：？！]/g) || []).length;
    if (punctuationCount > 2 && line.length > 20) return true;

    // 6. 包含数字但格式不对（如页码、年份等）
    if (/\d{4,}/.test(line) && !/^第\d+/.test(line)) return true; // 4 位以上数字通常是年份或页码

    // 7. 包含特殊字符但格式不对
    if (/[*\-=]{3,}/.test(line) && line.length < 5) {
      // 分隔线，可能是章节分隔，保留
      return false;
    }
    if (/[*\-=]{3,}/.test(line) && line.length > 10) return true; // 长分隔线不是章节

    // 8. 前后都没有空行，且不是明显的章节格式
    const prevEmpty = lineIndex > 0 && allLines[lineIndex - 1].trim() === '';
    const nextEmpty = lineIndex < allLines.length - 1 && allLines[lineIndex + 1].trim() === '';
    if (!prevEmpty && !nextEmpty) {
      // 前后都没有空行，需要更严格的检查
      if (!/^第[一二三四五六七八九十百千万\d]+[章节卷部回]/.test(line) &&
          !/^Chapter\s+\d+/i.test(line) &&
          !/^[IVX]+$/.test(line) &&
          !/^\d+[.、]/.test(line) &&
          !/^[一二三四五六七八九十]+[、.]/.test(line)) {
        return true;
      }
    }

    return false;
  }

  /**
   * 计算一行是章节标题的分数（0-1）
   */
  private calculateChapterScore(line: string, lineIndex: number, allLines: string[]): number {
    let score = 0;

    // 1. 长度特征（章节标题通常较短）
    if (line.length <= 20) score += 0.3;
    else if (line.length <= 50) score += 0.2;
    else if (line.length > 100) score -= 0.5; // 长文本扣分

    // 2. 位置特征（前后有空行）
    const prevEmpty = lineIndex > 0 && allLines[lineIndex - 1].trim() === '';
    const nextEmpty = lineIndex < allLines.length - 1 && allLines[lineIndex + 1].trim() === '';
    if (prevEmpty && nextEmpty) score += 0.4; // 前后都有空行，很可能是章节
    else if (prevEmpty || nextEmpty) score += 0.2;

    // 3. 明确的章节格式（高分）
    if (/^第[一二三四五六七八九十百千万\d]+[章节卷部回]/.test(line)) {
      score += 0.6; // 中文章节格式
      return Math.min(1, score); // 直接返回高分
    }
    if (/^Chapter\s+\d+/i.test(line)) {
      score += 0.6; // 英文章节格式
      return Math.min(1, score);
    }
    if (/^[IVX]+$/.test(line) && line.length <= 10) {
      score += 0.5; // 罗马数字（单独一行）
      return Math.min(1, score);
    }
    if (/^\d+[.、]/.test(line) && line.length <= 30) {
      score += 0.4; // 数字编号
    }
    if (/^[一二三四五六七八九十]+[、.]/.test(line) && line.length <= 30) {
      score += 0.4; // 中文数字编号
    }
    if (/^[一二三四五六七八九十百千万]+$/.test(line) && line.length <= 5) {
      score += 0.5; // 单独的中文数字（如"一"、"二"）
    }

    // 4. 特殊分隔符（可能是章节分隔）
    if (/^[*\-=]{3,}$/.test(line) && line.length <= 20) {
      score += 0.3;
    }

    // 5. 重复模式（如果发现类似的模式，可能是章节）
    const similarCount = allLines.filter((l) => {
      const trimmed = l.trim();
      if (trimmed === line) return false; // 排除自己
      return trimmed.length >= 1 && 
             trimmed.length <= 30 && 
             this.similarity(line, trimmed) > 0.6; // 提高相似度阈值
    }).length;
    if (similarCount >= 2 && similarCount <= 50) { // 限制在合理范围内
      score += Math.min(0.3, similarCount * 0.05);
    }

    // 6. 排除特征（扣分）
    // 包含对话标记
    const quoteChars = ['"', '"', "'", "'", '"', '"'];
    const hasQuotes = quoteChars.some(char => line.includes(char));
    if (hasQuotes && line.length > 15) {
      const quoteCount = quoteChars.reduce((count, char) => count + (line.split(char).length - 1), 0);
      if (quoteCount >= 2) score -= 0.3; // 成对引号通常是对话
    }
    // 包含多个标点
    const punctuationCount = (line.match(/[，。、；：？！]/g) || []).length;
    if (punctuationCount > 1 && line.length > 20) score -= 0.2;
    // 包含常见正文词汇
    if (line.includes('回答') || line.includes('说道') || line.includes('给我')) {
      if (line.length > 15) score -= 0.3;
    }

    return Math.min(1, Math.max(0, score));
  }

  /**
   * 计算两行文本的相似度
   */
  private similarity(line1: string, line2: string): number {
    const set1 = new Set(line1.split(''));
    const set2 = new Set(line2.split(''));

    const intersection = new Set([...set1].filter((x) => set2.has(x)));
    const union = new Set([...set1, ...set2]);

    return intersection.size / union.size;
  }

  async dispose(): Promise<void> {
    if (this.session) {
      await this.session.release();
      this.session = null;
    }
    this.isInitialized = false;
  }
}

/**
 * 增强的分词器
 * 支持更好的文本特征提取
 */
class EnhancedTokenizer {
  private vocab: Map<string, number> = new Map();
  private maxVocabSize = 20000;

  constructor() {
    this.initializeVocab();
  }

  private initializeVocab() {
    // 初始化基本词汇表
    const basicTokens = [
      '<PAD>',
      '<UNK>',
      '<CLS>',
      '<SEP>',
      '[EMPTY]',
      // 中文章节相关
      '第',
      '章',
      '节',
      '卷',
      '部',
      '回',
      '一',
      '二',
      '三',
      '四',
      '五',
      '六',
      '七',
      '八',
      '九',
      '十',
      '百',
      '千',
      '万',
      '亿',
      // 英文章节相关
      'Chapter',
      'Section',
      'Part',
      'Book',
      'Volume',
      // 标点
      '.',
      '、',
      '，',
      '。',
      '：',
      '；',
    ];

    basicTokens.forEach((token, index) => {
      this.vocab.set(token, index);
    });

    // 添加常见字符
    for (let i = 0; i < 256; i++) {
      const char = String.fromCharCode(i);
      if (!this.vocab.has(char)) {
        this.vocab.set(char, this.vocab.size);
      }
    }
  }

  tokenize(text: string, maxLength: number): number[] {
    const tokens: number[] = [];

    // 字符级分词
    const chars = text.split('');

    for (const char of chars) {
      if (tokens.length >= maxLength) break;

      const tokenId = this.vocab.get(char) || this.vocab.get('<UNK>') || 1;
      tokens.push(tokenId);
    }

    // 填充到指定长度
    while (tokens.length < maxLength) {
      tokens.push(this.vocab.get('<PAD>') || 0);
    }

    return tokens.slice(0, maxLength);
  }
}

// 导出默认配置
export const defaultEnhancedAIConfig: EnhancedAIConfig = {
  modelPath: '/weread/models/chapter_classifier.onnx',
  threshold: 0.7,
  maxLength: 256,
  batchSize: 32,
  useContextFeatures: true,
};
