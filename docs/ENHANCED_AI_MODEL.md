# 增强的 AI 章节提取模型

## 概述

新的增强 AI 章节提取器使用 **ONNX Runtime** 替代 TensorFlow.js，提供更好的性能和更灵活的模型训练能力。

## 主要改进

### 1. 使用 ONNX Runtime

- ✅ **更轻量**：ONNX Runtime 比 TensorFlow.js 更小更快
- ✅ **跨平台**：支持 WebAssembly，在所有浏览器中运行
- ✅ **持续训练**：可以轻松更新和替换模型文件
- ✅ **更好的性能**：优化的推理引擎

### 2. 增强的文本特征

- ✅ **上下文特征**：分析前后行文本，提高识别准确率
- ✅ **位置特征**：检测空行、段落开始等位置信息
- ✅ **长度特征**：章节标题通常较短
- ✅ **模式特征**：识别数字、特殊字符等模式

### 3. 智能降级策略

```
增强 ONNX 模型 → TensorFlow.js 模型 → 启发式方法
```

## 快速开始

### 基本使用

```typescript
import { extractChaptersWithAI } from '@/lib/aiChapterExtractor';

const chapters = await extractChaptersWithAI(text, {
  useEnhancedModel: true, // 使用增强模型
  enhancedConfig: {
    modelPath: '/weread/models/chapter_classifier.onnx',
    threshold: 0.7,
    useContextFeatures: true,
  },
});
```

### 模型文件

将训练好的 ONNX 模型文件放到：

```
public/models/chapter_classifier.onnx
```

## 模型训练

### 1. 准备训练数据

```typescript
import { ONNXModelTrainer } from '@/lib/onnxModelTrainer';

// 从书籍文本生成训练数据
const trainingData = ONNXModelTrainer.generateTrainingData(
  bookText,
  knownChapters, // 已知的章节标题
  {
    includeContext: true, // 包含上下文
    balanceSamples: true, // 平衡样本
  }
);

// 导出为 JSON
const json = ONNXModelTrainer.exportTrainingData(trainingData);
```

### 2. 训练模型（Python）

参考 `lib/onnxModelTrainer.ts` 中的 Python 训练脚本模板。

主要步骤：

1. 加载训练数据
2. 构建模型（推荐使用 LSTM 或 Transformer）
3. 训练模型
4. 导出为 ONNX 格式

### 3. 部署模型

将训练好的 `.onnx` 文件放到 `public/models/` 目录。

## 配置选项

```typescript
interface EnhancedAIConfig {
  modelPath: string;           // 模型文件路径
  threshold: number;            // 置信度阈值 (0-1)
  maxLength: number;            // 最大输入长度
  batchSize: number;            // 批量处理大小
  useContextFeatures?: boolean; // 是否使用上下文特征
}
```

## 性能对比

| 特性           | TensorFlow.js | ONNX Runtime |
| -------------- | ------------- | ------------ |
| 模型大小       | ~2MB          | ~1MB         |
| 推理速度       | 基准          | 1.5-2x 更快  |
| 内存占用       | 基准          | 更少         |
| 模型更新       | 困难          | 简单         |
| 跨平台支持     | 良好          | 优秀         |

## 故障排除

### 模型文件未找到

如果模型文件不存在，系统会自动降级到 TensorFlow.js 模型或启发式方法。

### 性能问题

- 减小 `batchSize` 以降低内存占用
- 减小 `maxLength` 以加快处理速度
- 关闭 `useContextFeatures` 以减少计算量

### 准确率问题

- 调整 `threshold` 值（降低阈值会识别更多章节，但可能有误报）
- 使用更多训练数据重新训练模型
- 启用 `useContextFeatures` 以提高准确率

## 持续改进

1. **收集数据**：从用户反馈中收集章节识别结果
2. **重新训练**：使用新数据训练模型
3. **更新模型**：替换 `public/models/chapter_classifier.onnx` 文件
4. **验证效果**：测试新模型的效果

## 相关文件

- `lib/enhancedAIChapterExtractor.ts` - 增强的 AI 提取器实现
- `lib/aiChapterExtractor.ts` - AI 提取器主入口
- `lib/onnxModelTrainer.ts` - 训练数据生成工具
- `docs/AI_CHAPTER_EXTRACTION.md` - 完整文档
