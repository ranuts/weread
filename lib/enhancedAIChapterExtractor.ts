import * as ort from 'onnxruntime-web';
import type { ChapterItem } from './transformText';

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
    } catch (error) {
      console.warn('Failed to initialize enhanced AI model, will use fallback method:', error);
      this.isInitialized = false;
    }
  }

  private async checkModelExists(): Promise<boolean> {
    try {
      const response = await fetch(this.config.modelPath, { method: 'HEAD' });
      return response.ok;
    } catch (error) {
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
    } catch (error) {
      console.warn('Enhanced AI prediction failed, falling back to method:', error);
      return this.fallbackExtraction(text);
    }
  }

  /**
   * 使用上下文提取候选章节
   */
  private extractCandidatesWithContext(
    lines: string[],
    text: string,
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
      if (lastChapter && chapter.startIndex < lastChapter.endIndex + 100) {
        if (chapter.confidence > lastChapter.confidence) {
          merged[merged.length - 1] = chapter;
        }
        continue;
      }

      merged.push(chapter);
    }

    // 设置结束位置
    merged.forEach((chapter, index) => {
      const nextChapter = merged[index + 1];
      chapter.endIndex = nextChapter ? nextChapter.startIndex : text.length;
    });

    return merged;
  }

  /**
   * 后备提取方法（当模型不可用时）
   */
  private fallbackExtraction(text: string): ChapterInfo[] {
    const chapters: ChapterInfo[] = [];
    const lines = text.split('\n');
    let currentIndex = 0;

    // 使用改进的启发式方法
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line.length > 200) {
        currentIndex += lines[i].length + 1;
        continue;
      }

      // 检查是否是章节标题的特征
      const score = this.calculateChapterScore(line, i, lines);
      if (score > 0.5) {
        const startIndex = currentIndex + lines[i].indexOf(line);
        const endIndex = startIndex + line.length;

        chapters.push({
          title: line,
          startIndex,
          endIndex,
          confidence: score,
        });
      }

      currentIndex += lines[i].length + 1;
    }

    return this.postProcessChapters(chapters, text);
  }

  /**
   * 计算一行是章节标题的分数（0-1）
   */
  private calculateChapterScore(line: string, lineIndex: number, allLines: string[]): number {
    let score = 0;

    // 1. 长度特征（章节标题通常较短）
    if (line.length < 50) score += 0.2;
    if (line.length > 200) score -= 0.3;

    // 2. 位置特征（前后有空行）
    const prevEmpty = lineIndex > 0 && allLines[lineIndex - 1].trim() === '';
    const nextEmpty = lineIndex < allLines.length - 1 && allLines[lineIndex + 1].trim() === '';
    if (prevEmpty && nextEmpty) score += 0.3;
    else if (prevEmpty || nextEmpty) score += 0.15;

    // 3. 数字模式
    if (/^[一二三四五六七八九十百千万\d]+$/.test(line)) score += 0.4;
    if (/^第[一二三四五六七八九十百千万\d]+[章节卷部回]/.test(line)) score += 0.5;
    if (/^Chapter\s+\d+/i.test(line)) score += 0.5;
    if (/^\d+[\.、]/.test(line)) score += 0.3;
    if (/^[IVX]+[\.、]/.test(line)) score += 0.3;

    // 4. 重复模式（如果发现类似的模式）
    const similarCount = allLines.filter((l) => {
      const trimmed = l.trim();
      return trimmed.length > 5 && trimmed.length < 100 && this.similarity(line, trimmed) > 0.5;
    }).length;
    if (similarCount > 2) score += 0.2;

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
