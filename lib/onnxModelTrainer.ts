/**
 * ONNX 模型训练器
 * 用于训练和导出章节分类模型
 * 
 * 注意：ONNX 模型需要在 Python 环境中训练，这个文件提供训练数据准备和模型转换的接口
 */

export interface TrainingSample {
  text: string;
  isChapter: boolean;
  context?: {
    prevLine?: string;
    nextLine?: string;
    hasPrevEmpty?: boolean;
    hasNextEmpty?: boolean;
  };
}

export interface TrainingData {
  samples: TrainingSample[];
  metadata: {
    totalSamples: number;
    positiveSamples: number;
    negativeSamples: number;
    languages: string[];
  };
}

/**
 * 训练数据生成器
 * 从书籍文本中生成训练数据
 */
export class ONNXModelTrainer {
  /**
   * 从文本中提取训练样本
   */
  static generateTrainingData(
    text: string,
    knownChapters: string[],
    options: {
      includeContext?: boolean;
      balanceSamples?: boolean;
    } = {},
  ): TrainingData {
    const { includeContext = true, balanceSamples = true } = options;
    const samples: TrainingSample[] = [];
    const lines = text.split('\n');

    // 生成正样本（已知章节）
    const positiveSamples: TrainingSample[] = [];
    for (const chapter of knownChapters) {
      const chapterLine = lines.find((line) => line.trim() === chapter);
      if (chapterLine) {
        const lineIndex = lines.indexOf(chapterLine);
        const sample: TrainingSample = {
          text: chapter.trim(),
          isChapter: true,
        };

        if (includeContext) {
          sample.context = {
            prevLine: lineIndex > 0 ? lines[lineIndex - 1].trim() : undefined,
            nextLine: lineIndex < lines.length - 1 ? lines[lineIndex + 1].trim() : undefined,
            hasPrevEmpty: lineIndex > 0 && lines[lineIndex - 1].trim() === '',
            hasNextEmpty: lineIndex < lines.length - 1 && lines[lineIndex + 1].trim() === '',
          };
        }

        positiveSamples.push(sample);
      }
    }

    // 生成负样本（非章节文本）
    const negativeSamples: TrainingSample[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line.length > 200) continue;

      // 跳过已知章节
      if (knownChapters.some((ch) => ch.trim() === line)) continue;

      // 跳过过短或过长的行
      if (line.length < 3 || line.length > 200) continue;

      const sample: TrainingSample = {
        text: line,
        isChapter: false,
      };

      if (includeContext) {
        sample.context = {
          prevLine: i > 0 ? lines[i - 1].trim() : undefined,
          nextLine: i < lines.length - 1 ? lines[i + 1].trim() : undefined,
          hasPrevEmpty: i > 0 && lines[i - 1].trim() === '',
          hasNextEmpty: i < lines.length - 1 && lines[i + 1].trim() === '',
        };
      }

      negativeSamples.push(sample);
    }

    // 平衡样本
    if (balanceSamples) {
      const targetCount = positiveSamples.length * 2; // 负样本是正样本的 2 倍
      const shuffled = negativeSamples.sort(() => Math.random() - 0.5);
      negativeSamples.splice(0, negativeSamples.length, ...shuffled.slice(0, targetCount));
    }

    samples.push(...positiveSamples, ...negativeSamples);

    return {
      samples,
      metadata: {
        totalSamples: samples.length,
        positiveSamples: positiveSamples.length,
        negativeSamples: negativeSamples.length,
        languages: this.detectLanguages(text),
      },
    };
  }

  /**
   * 检测文本语言
   */
  private static detectLanguages(text: string): string[] {
    const languages: string[] = [];
    const chineseRegex = /[\u4e00-\u9fa5]/;
    const englishRegex = /[a-zA-Z]/;

    if (chineseRegex.test(text)) {
      languages.push('zh');
    }
    if (englishRegex.test(text)) {
      languages.push('en');
    }

    return languages;
  }

  /**
   * 导出训练数据为 JSON 格式
   */
  static exportTrainingData(data: TrainingData): string {
    return JSON.stringify(data, null, 2);
  }

  /**
   * 从 JSON 导入训练数据
   */
  static importTrainingData(json: string): TrainingData {
    return JSON.parse(json) as TrainingData;
  }

  /**
   * 格式化训练数据为模型输入格式
   */
  static formatForModel(sample: TrainingSample, maxLength: number = 256): {
    input: number[];
    label: number;
  } {
    let textToTokenize = sample.text;

    // 如果有上下文，构建上下文字符串
    if (sample.context) {
      const prev = sample.context.hasPrevEmpty ? '[EMPTY]' : (sample.context.prevLine?.slice(-20) || '');
      const next = sample.context.hasNextEmpty ? '[EMPTY]' : (sample.context.nextLine?.slice(0, 20) || '');
      textToTokenize = `${prev} | ${sample.text} | ${next}`;
    }

    // 简单的字符级 tokenization（实际应该使用更好的分词器）
    const tokens = this.tokenize(textToTokenize, maxLength);

    return {
      input: tokens,
      label: sample.isChapter ? 1 : 0,
    };
  }

  /**
   * 简单的字符级分词
   */
  private static tokenize(text: string, maxLength: number): number[] {
    const vocab = new Map<string, number>();
    const basicTokens = [
      '<PAD>',
      '<UNK>',
      '<CLS>',
      '<SEP>',
      '[EMPTY]',
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
      vocab.set(token, index);
    });

    // 添加常见字符
    for (let i = 0; i < 256; i++) {
      const char = String.fromCharCode(i);
      if (!vocab.has(char)) {
        vocab.set(char, vocab.size);
      }
    }

    const tokens: number[] = [];
    const chars = text.split('');

    for (const char of chars) {
      if (tokens.length >= maxLength) break;
      const tokenId = vocab.get(char) || vocab.get('<UNK>') || 1;
      tokens.push(tokenId);
    }

    while (tokens.length < maxLength) {
      tokens.push(vocab.get('<PAD>') || 0);
    }

    return tokens.slice(0, maxLength);
  }
}

/**
 * Python 训练脚本模板
 * 这个脚本需要在 Python 环境中运行，使用 PyTorch 或 TensorFlow 训练模型
 */
export const PYTHON_TRAINING_SCRIPT = `
# Python 训练脚本示例
# 需要安装: pip install torch onnx onnxruntime

import json
import torch
import torch.nn as nn
import numpy as np
from onnxruntime import InferenceSession

class ChapterClassifier(nn.Module):
    def __init__(self, vocab_size=20000, embedding_dim=128, hidden_dim=256, max_length=256):
        super().__init__()
        self.embedding = nn.Embedding(vocab_size, embedding_dim)
        self.lstm = nn.LSTM(embedding_dim, hidden_dim, batch_first=True, bidirectional=True)
        self.fc = nn.Linear(hidden_dim * 2, 2)  # 2 classes: chapter or not
        
    def forward(self, x):
        x = self.embedding(x)
        lstm_out, _ = self.lstm(x)
        # 使用最后一个时间步的输出
        output = self.fc(lstm_out[:, -1, :])
        return output

# 训练函数
def train_model(training_data_path, epochs=10, batch_size=32):
    # 加载训练数据
    with open(training_data_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    # 准备数据...
    # 训练模型...
    # 导出为 ONNX 格式...
    pass

# 导出 ONNX 模型
def export_to_onnx(model, output_path):
    model.eval()
    dummy_input = torch.randint(0, 20000, (1, 256))
    torch.onnx.export(
        model,
        dummy_input,
        output_path,
        input_names=['input'],
        output_names=['output'],
        dynamic_axes={'input': {0: 'batch_size'}, 'output': {0: 'batch_size'}}
    )
`;
