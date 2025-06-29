import * as tf from '@tensorflow/tfjs';

export interface ChapterInfo {
  title: string;
  startIndex: number;
  endIndex: number;
  confidence: number;
}

export interface TFJSConfig {
  modelPath: string;
  threshold: number;
  maxLength: number;
  batchSize: number;
  vocabSize: number;
}

export class TFJSChapterExtractor {
  private model: tf.LayersModel | null = null;
  private config: TFJSConfig;
  private tokenizer: TFJSTokenizer;
  private isInitialized = false;

  constructor(config: Partial<TFJSConfig> = {}) {
    this.config = {
      modelPath: '/weread/models/chapter_classifier.json',
      threshold: 0.7,
      maxLength: 128,
      batchSize: 32,
      vocabSize: 1000,
      ...config,
    };
    this.tokenizer = new TFJSTokenizer(this.config.vocabSize, this.config.maxLength);
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // 尝试加载已保存的模型
      const modelExists = await this.checkModelExists();
      if (modelExists) {
        this.model = await tf.loadLayersModel(this.config.modelPath);
        this.isInitialized = true;
        console.log('TFJS Chapter Extractor initialized successfully');
        return;
      }

      // 如果模型不存在，使用启发式方法
      console.log('Model not found, using heuristic method');
      this.isInitialized = false;
    } catch (error) {
      console.warn('Failed to initialize TFJS model, falling back to heuristic method:', error);
      this.isInitialized = false;
    }
  }

  private async checkModelExists(): Promise<boolean> {
    try {
      const response = await fetch(this.config.modelPath, { method: 'HEAD' });
      return response.ok;
    } catch (error) {
      console.log('checkModelExists', error);
      return false;
    }
  }

  async extractChapters(text: string): Promise<ChapterInfo[]> {
    if (!this.isInitialized || !this.model) {
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
      console.warn('TFJS prediction failed, falling back to heuristic method:', error);
      return this.fallbackExtraction(text);
    }
  }

  private async predictBatch(lines: string[]): Promise<number[]> {
    if (!this.model) throw new Error('Model not initialized');

    // 对文本进行分词和编码
    const encodedLines = lines.map(line => this.tokenizer.tokenize(line));
    const inputTensor = tf.tensor2d(encodedLines, [lines.length, this.config.maxLength]);

    // 进行预测
    const predictions = this.model.predict(inputTensor) as tf.Tensor;
    const predictionArray = await predictions.array() as number[][];

    // 清理内存
    inputTensor.dispose();
    predictions.dispose();

    // 返回章节概率（第二列）
    return predictionArray.map(pred => pred[1]);
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
      /^\s*[IVX]+\s*$/,  // 独立的罗马数字，前后可能有空格
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
    if (this.model) {
      this.model.dispose();
      this.model = null;
    }
    this.isInitialized = false;
  }
}

// TensorFlow.js 分词器
class TFJSTokenizer {
  private vocab: Map<string, number> = new Map();
  private maxVocabSize: number;
  private maxLength: number;

  constructor(maxVocabSize: number, maxLength: number) {
    this.maxVocabSize = maxVocabSize;
    this.maxLength = maxLength;
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

  tokenize(text: string): number[] {
    const tokens: number[] = [];

    // 简单的字符级分词
    const chars = text.split('');

    for (const char of chars) {
      if (tokens.length >= this.maxLength) break;

      const tokenId = this.vocab.get(char) || this.vocab.get('<UNK>') || 1;
      tokens.push(tokenId);
    }

    // 填充到指定长度
    while (tokens.length < this.maxLength) {
      tokens.push(this.vocab.get('<PAD>') || 0);
    }

    return tokens.slice(0, this.maxLength);
  }
}

// 导出默认配置
export const defaultTFJSConfig: TFJSConfig = {
  modelPath: '/weread/models/chapter_classifier.json',
  threshold: 0.7,
  maxLength: 128,
  batchSize: 32,
  vocabSize: 1000,
}; 