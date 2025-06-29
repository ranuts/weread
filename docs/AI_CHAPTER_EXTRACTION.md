# AI 章节提取功能

## 概述

AI 章节提取功能是一个智能的文本分析工具，能够自动识别和提取 TXT 文件中的章节结构。相比传统的基于正则表达式的章节识别方法，AI 方法更加灵活和准确，能够处理各种不同格式的文本文件。

## 功能特点

### 🤖 智能识别

- **多格式支持**：支持中文、英文、罗马数字等多种章节标记格式
- **模式识别**：能够识别重复的章节标题模式
- **启发式分析**：基于文本结构特征进行智能判断

### 🔄 混合策略

- **传统方法优先**：首先使用正则表达式进行快速匹配
- **AI 辅助增强**：当传统方法效果不佳时，自动启用 AI 分析
- **结果合并**：智能合并两种方法的结果，避免重复

### ⚡ 高性能

- **本地处理**：所有分析都在本地进行，保护隐私
- **快速响应**：优化的算法确保处理速度
- **内存友好**：支持大文件处理，内存占用可控

## 使用方法

### 1. 基本使用

```typescript
import { extractChaptersWithAI } from '@/lib/aiChapterExtractor';

const text = `
第一章 引言
这是第一章的内容。

第二章 正文
这是第二章的内容。
`;

const chapters = await extractChaptersWithAI(text);
console.log(chapters);
// 输出: [
//   { title: "第一章 引言", start: 0, end: 50 },
//   { title: "第二章 正文", start: 51, end: 100 }
// ]
```

### 2. 自定义配置

```typescript
import { AIChapterExtractor } from '@/lib/aiChapterExtractor';

const extractor = new AIChapterExtractor({
  confidenceThreshold: 0.8, // 置信度阈值
  maxChapters: 50, // 最大章节数
  useLocalModel: true, // 使用本地模型
});

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

1. **文本特征提取**

   - 行长度分析
   - 特殊字符检测
   - 数字模式识别
   - 重复模式分析

2. **启发式规则**

   - 章节标题长度限制
   - 位置特征分析
   - 相似度计算
   - 上下文分析

3. **智能决策**
   - 传统方法效果评估
   - AI 方法触发条件
   - 结果质量评估
   - 结果合并策略

### 性能优化

- **异步处理**：使用 Promise 和 async/await 避免阻塞
- **内存管理**：及时释放不需要的数据
- **缓存机制**：避免重复计算
- **错误处理**：优雅降级到传统方法

## 配置选项

| 选项                  | 类型    | 默认值 | 说明             |
| --------------------- | ------- | ------ | ---------------- |
| `useLocalModel`       | boolean | true   | 是否使用本地模型 |
| `confidenceThreshold` | number  | 0.7    | 置信度阈值       |
| `maxChapters`         | number  | 100    | 最大章节数限制   |

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

## 未来计划

### 短期目标

- [ ] 集成真正的本地 AI 模型
- [ ] 支持更多文本格式
- [ ] 优化处理性能

### 长期目标

- [ ] 支持多语言章节识别
- [ ] 学习用户偏好
- [ ] 云端 AI 服务集成

## 贡献

欢迎贡献代码和想法！请查看 [CONTRIBUTING.md](../CONTRIBUTING.md) 了解如何参与项目开发。

## 许可证

本项目采用 MIT 许可证，详见 [LICENSE](../LICENSE) 文件。
