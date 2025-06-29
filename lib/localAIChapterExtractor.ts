import * as ort from 'onnxruntime-web';

export interface ChapterInfo {
  title: string;
  startIndex: number;
  endIndex: number;
  confidence: number;
}

export interface LocalAIConfig {
  modelPath: string;
  threshold: number;
  maxLength: number;
  batchSize: number;
}

export class LocalAIChapterExtractor {
  private session: ort.InferenceSession | null = null;
  private config: LocalAIConfig;
  private tokenizer: SimpleTokenizer;
  private isInitialized = false;

  constructor(config: Partial<LocalAIConfig> = {}) {
    this.config = {
      modelPath: '/weread/models/chapter_classifier.onnx',
      threshold: 0.7,
      maxLength: 128,
      batchSize: 32,
      ...config,
    };
    this.tokenizer = new SimpleTokenizer();
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
        console.log('Model file not found, using heuristic method');
        this.isInitialized = false;
        return;
      }

      // 尝试加载模型
      this.session = await ort.InferenceSession.create(this.config.modelPath);
      this.isInitialized = true;

      console.log('Local AI Chapter Extractor initialized successfully');
    } catch (error) {
      console.warn('Failed to initialize local AI model, falling back to heuristic method:', error);
      this.isInitialized = false;
    }
  }

  private async checkModelExists(): Promise<boolean> {
    try {
      const response = await fetch(this.config.modelPath, { method: 'HEAD' });
      return response.ok;
    } catch (error) {
      console.warn('Failed to check model file:', error);
      return false;
    }
  }

  async extractChapters(text: string): Promise<ChapterInfo[]> {
    if (!this.isInitialized) {
      return this.fallbackExtraction(text);
    }

    try {
      const lines = text.split('\n').filter((line) => line.trim());
      const chapters: ChapterInfo[] = [];

      // 分批处理以提高性能
      for (let i = 0; i < lines.length; i += this.config.batchSize) {
        const batch = lines.slice(i, i + this.config.batchSize);
        const predictions = await this.predictBatch(batch);

        for (let j = 0; j < batch.length; j++) {
          const line = batch[j];
          const confidence = predictions[j];

          if (confidence > this.config.threshold) {
            const startIndex = text.indexOf(line);
            const endIndex = startIndex + line.length;

            chapters.push({
              title: line.trim(),
              startIndex,
              endIndex,
              confidence,
            });
          }
        }
      }

      return this.postProcessChapters(chapters, text);
    } catch (error) {
      console.warn('AI prediction failed, falling back to heuristic method:', error);
      return this.fallbackExtraction(text);
    }
  }

  private async predictBatch(lines: string[]): Promise<number[]> {
    if (!this.session) throw new Error('Model not initialized');

    const inputs: number[][] = [];

    for (const line of lines) {
      const tokens = this.tokenizer.tokenize(line, this.config.maxLength);
      inputs.push(tokens);
    }

    // 修复 BigInt64Array 构造器类型
    const flatInputs = inputs.flat().map((x) => BigInt(x));
    const inputTensor = new ort.Tensor('int64', new BigInt64Array(flatInputs as bigint[]), [
      inputs.length,
      this.config.maxLength,
    ]);

    const feeds = { input: inputTensor };
    const results = await this.session.run(feeds);

    const output = results.output.data as Float32Array;
    const predictions: number[] = [];

    for (let i = 0; i < lines.length; i++) {
      predictions.push(output[i * 2 + 1]); // 假设模型输出 [not_chapter_prob, chapter_prob]
    }

    return predictions;
  }

  private postProcessChapters(chapters: ChapterInfo[], _text: string): ChapterInfo[] {
    // 按位置排序
    chapters.sort((a, b) => a.startIndex - b.startIndex);

    // 去重和合并
    const merged: ChapterInfo[] = [];
    for (const chapter of chapters) {
      const lastChapter = merged[merged.length - 1];

      if (!lastChapter || chapter.startIndex > lastChapter.endIndex + 50) {
        merged.push(chapter);
      } else if (chapter.confidence > lastChapter.confidence) {
        // 如果新章节置信度更高，替换旧的
        merged[merged.length - 1] = chapter;
      }
    }

    return merged;
  }

  private fallbackExtraction(_text: string): ChapterInfo[] {
    // 使用启发式方法作为后备
    const chapters: ChapterInfo[] = [];
    const lines = _text.split('\n');

    const chapterPatterns = [
      /^第[一二三四五六七八九十百千万\d]+[章节卷部]/,
      /^Chapter\s+\d+/i,
      /^[IVX]+\./,
      /^\d+\./,
      /^[一二三四五六七八九十]+、/,
      /^[一二三四五六七八九十]+$/,
      /^[A-Z][A-Z\s]+$/,
      /^[第\d]+章/,
      /^[第\d]+节/,
    ];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.length < 3 || line.length > 100) continue;

      const isChapter = chapterPatterns.some((pattern) => pattern.test(line));

      if (isChapter) {
        const startIndex = _text.indexOf(line);
        const endIndex = startIndex + line.length;

        chapters.push({
          title: line,
          startIndex,
          endIndex,
          confidence: 0.8, // 启发式方法的置信度
        });
      }
    }

    return chapters;
  }

  async dispose(): Promise<void> {
    if (this.session) {
      await this.session.release();
      this.session = null;
    }
    this.isInitialized = false;
  }
}

// 简单的分词器实现
class SimpleTokenizer {
  private vocab: Map<string, number> = new Map();
  private maxVocabSize = 10000;

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
      '第',
      '章',
      '节',
      '卷',
      '部',
      '回',
      'Chapter',
      'Section',
      'Part',
      'Book',
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
    ];

    basicTokens.forEach((token, index) => {
      this.vocab.set(token, index);
    });
  }

  tokenize(text: string, maxLength: number): number[] {
    const tokens: number[] = [];

    // 简单的字符级分词
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
export const defaultLocalAIConfig: LocalAIConfig = {
  modelPath: '/weread/models/chapter_classifier.onnx',
  threshold: 0.7,
  maxLength: 128,
  batchSize: 32,
};
