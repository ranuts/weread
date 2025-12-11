# AI 章节提取功能

## 概述

AI 章节提取功能是一个基于深度学习的智能文本分析工具，能够自动识别和提取 TXT 文件中的章节结构。使用 **ONNX Runtime** 在浏览器中运行本地 AI 模型，支持持续训练和模型更新，能够适应各种不同格式的文本文件。

## 功能特点

### 🤖 基于文本的 AI 识别

- **深度学习模型**：使用 ONNX Runtime 运行本地训练的神经网络模型
- **上下文特征**：分析前后行文本，提高识别准确率
- **持续训练**：支持从用户数据中学习，不断改进模型
- **多格式支持**：自动适应中文、英文、罗马数字等多种章节标记格式

### 🔄 智能降级策略

- **增强模型优先**：优先使用 ONNX 增强模型进行识别
- **TF.js 后备**：如果 ONNX 模型不可用，自动降级到 TensorFlow.js 模型
- **启发式兜底**：最终降级到基于规则的启发式方法
- **结果合并**：智能合并多种方法的结果，避免重复

### ⚡ 高性能

- **本地处理**：所有分析都在浏览器本地进行，保护隐私
- **ONNX Runtime**：使用优化的 ONNX Runtime，比 TensorFlow.js 更快更轻量
- **批量处理**：支持批量预测，提高处理速度
- **内存友好**：支持大文件处理，内存占用可控

## 使用方法

### 1. 基本使用

```typescript
import { extractChaptersWithAI } from '@/lib/aiChapterExtractor';

const text = `
一

我们所要介绍的是祥子...

二

因为高兴，胆子也就大起来...
`;

const chapters = await extractChaptersWithAI(text, {
  useEnhancedModel: true, // 使用增强的 ONNX 模型
  confidenceThreshold: 0.7,
  enhancedConfig: {
    modelPath: '/weread/models/chapter_classifier.onnx',
    threshold: 0.7,
    maxLength: 256,
    useContextFeatures: true, // 使用上下文特征
  },
});
console.log(chapters);
// 输出：[
//   { title: "一", start: 0, end: 10, confidence: 0.95 },
//   { title: "二", start: 100, end: 110, confidence: 0.92 }
// ]
```

### 2. 自定义配置

```typescript
import { AIChapterExtractor } from '@/lib/aiChapterExtractor';

const extractor = new AIChapterExtractor({
  useEnhancedModel: true, // 使用增强的 ONNX 模型
  confidenceThreshold: 0.8, // 置信度阈值
  maxChapters: 50, // 最大章节数
  enhancedConfig: {
    modelPath: '/weread/models/chapter_classifier.onnx',
    threshold: 0.8,
    maxLength: 256,
    batchSize: 64,
    useContextFeatures: true, // 启用上下文特征
  },
});

await extractor.initialize();
const chapters = await extractor.extractChapters(text);
```

### 3. 在阅读器中使用

在书籍详情页面，用户可以：

1. **开启 AI 识别**：点击 "AI 章节识别" 复选框
2. **自动处理**：系统会自动重新分析文本并提取章节
3. **实时切换**：可以在传统方法和 AI 方法之间自由切换

## 支持的格式

### 中文章节格式

```
第一章 开始
第二章 发展
第三章 结束
```

### 英文章节格式

```
Chapter 1: The Beginning
Chapter 2: The Middle
Chapter 3: The End
```

### 罗马数字格式

```
I. First Chapter
II. Second Chapter
III. Third Chapter
```

### 特殊标记格式

```
*** Chapter One ***
--- Chapter Two ---
=== Chapter Three ===
```

### 数字标题格式

```
1. Introduction
2. Main Content
3. Conclusion
```

## 技术实现

### 核心算法

1. **增强的文本特征提取**

   - **上下文特征**：分析前后行文本，识别章节标题的上下文模式
   - **位置特征**：检测空行、段落开始等位置特征
   - **长度特征**：章节标题通常较短
   - **模式特征**：识别数字、特殊字符等模式
   - **相似度特征**：检测重复的章节标题模式

2. **ONNX 模型推理**

   - 使用 ONNX Runtime 在浏览器中运行预训练模型
   - 支持批量预测，提高处理速度
   - 模型输出置信度分数，用于筛选结果

3. **智能降级策略**
   - 优先使用增强的 ONNX 模型
   - 如果模型不可用，降级到 TensorFlow.js 模型
   - 最终降级到基于规则的启发式方法
   - 智能合并多种方法的结果

### 模型训练

模型可以通过以下方式训练和更新：

1. **准备训练数据**

```typescript
import { ONNXModelTrainer } from '@/lib/onnxModelTrainer';

const trainingData = ONNXModelTrainer.generateTrainingData(
  bookText,
  knownChapters, // 已知的章节标题列表
  {
    includeContext: true, // 包含上下文特征
    balanceSamples: true, // 平衡正负样本
  }
);

// 导出训练数据
const jsonData = ONNXModelTrainer.exportTrainingData(trainingData);
```

2. **训练模型**（需要在 Python 环境中进行）

使用 PyTorch 或 TensorFlow 训练模型，然后导出为 ONNX 格式：

```python
# 参考 lib/onnxModelTrainer.ts 中的 Python 训练脚本模板
```

3. **部署模型**

将训练好的 ONNX 模型文件放到 `public/models/` 目录下。

### 性能优化

- **ONNX Runtime**：使用优化的 ONNX Runtime，比 TensorFlow.js 更快更轻量
- **批量处理**：支持批量预测，减少推理次数
- **异步处理**：使用 Promise 和 async/await 避免阻塞
- **内存管理**：及时释放不需要的数据和模型资源
- **错误处理**：优雅降级到其他方法

## 配置选项

### AIChapterExtractorOptions

| 选项                  | 类型    | 默认值 | 说明                           |
| --------------------- | ------- | ------ | ------------------------------ |
| `useEnhancedModel`    | boolean | true   | 是否使用增强的 ONNX 模型        |
| `useLocalModel`        | boolean | true   | 是否使用本地模型（TF.js 后备）  |
| `confidenceThreshold` | number  | 0.7    | 置信度阈值                     |
| `maxChapters`         | number  | 100    | 最大章节数限制                 |
| `enhancedConfig`       | object  | -      | 增强模型的配置（见下表）        |
| `tfjsConfig`           | object  | -      | TensorFlow.js 模型的配置        |

### EnhancedAIConfig

| 选项                | 类型    | 默认值 | 说明                     |
| ------------------- | ------- | ------ | ------------------------ |
| `modelPath`         | string  | -      | ONNX 模型文件路径         |
| `threshold`         | number  | 0.7    | 置信度阈值               |
| `maxLength`         | number  | 256    | 最大输入长度             |
| `batchSize`         | number  | 32     | 批量处理大小             |
| `useContextFeatures`| boolean | true   | 是否使用上下文特征       |

## 错误处理

AI 章节提取功能具有完善的错误处理机制：

1. **降级策略**：AI 方法失败时自动降级到传统方法
2. **错误日志**：详细的错误信息记录
3. **用户反馈**：处理状态实时显示
4. **超时保护**：避免长时间处理

## 测试

项目包含了完整的测试用例：

```typescript
import { runAllTests } from '@/lib/aiChapterExtractor.test';

// 运行所有测试
await runAllTests();
```

测试包括：

- 不同格式的章节识别
- 性能测试
- 边界情况处理
- 错误场景测试

## 模型训练指南

### 1. 收集训练数据

从已知章节的书籍中收集训练数据：

```typescript
import { ONNXModelTrainer } from '@/lib/onnxModelTrainer';

// 从书籍文本和已知章节生成训练数据
const trainingData = ONNXModelTrainer.generateTrainingData(
  bookText,
  ['一', '二', '三', '第一章', '第二章'], // 已知章节
  {
    includeContext: true,
    balanceSamples: true,
  }
);

// 导出为 JSON
const jsonData = ONNXModelTrainer.exportTrainingData(trainingData);
```

### 2. 训练模型

在 Python 环境中使用 PyTorch 或 TensorFlow 训练模型：

```python
# 参考 lib/onnxModelTrainer.ts 中的 Python 训练脚本模板
# 主要步骤：
# 1. 加载训练数据
# 2. 构建模型（LSTM/Transformer）
# 3. 训练模型
# 4. 导出为 ONNX 格式
```

### 3. 部署模型

将训练好的 `.onnx` 模型文件放到 `public/models/chapter_classifier.onnx`

### 4. 持续改进

- 收集用户反馈的章节识别结果
- 定期重新训练模型
- 更新模型文件

## 未来计划

### 短期目标

- [x] 集成 ONNX Runtime 增强模型
- [x] 支持上下文特征提取
- [ ] 提供模型训练工具
- [ ] 支持在线模型更新

### 长期目标

- [ ] 支持多语言章节识别
- [ ] 学习用户偏好
- [ ] 云端模型训练服务
- [ ] 自动模型优化

## 贡献

欢迎贡献代码和想法！请查看 [CONTRIBUTING.md](../CONTRIBUTING.md) 了解如何参与项目开发。

## 许可证

本项目采用 MIT 许可证，详见 [LICENSE](../LICENSE) 文件。
