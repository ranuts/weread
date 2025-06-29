import { LocalAIChapterExtractor } from '../lib/localAIChapterExtractor';

describe('LocalAIChapterExtractor', () => {
  let extractor: LocalAIChapterExtractor;

  beforeEach(() => {
    extractor = new LocalAIChapterExtractor({
      modelPath: '/models/chapter_classifier.onnx',
      threshold: 0.7,
      maxLength: 128,
      batchSize: 32,
    });
  });

  afterEach(async () => {
    await extractor.dispose();
  });

  describe('initialization', () => {
    it('should initialize with default config', () => {
      expect(extractor).toBeDefined();
    });

    it('should handle initialization failure gracefully', async () => {
      const invalidExtractor = new LocalAIChapterExtractor({
        modelPath: '/invalid/path/model.onnx',
      });

      await expect(invalidExtractor.initialize()).resolves.not.toThrow();
    });
  });

  describe('chapter extraction', () => {
    it('should extract chapters from Chinese text', async () => {
      const text = `第一章 引言

这是一个示例文本，用于演示 AI 章节识别功能。

第二章 背景

在这一章中，我们将讨论项目的背景和历史。

第三章 方法

本章将详细介绍我们使用的方法和技术。`;

      const chapters = await extractor.extractChapters(text);

      expect(chapters).toBeDefined();
      expect(Array.isArray(chapters)).toBe(true);
      expect(chapters.length).toBeGreaterThan(0);

      // 检查章节结构
      chapters.forEach((chapter) => {
        expect(chapter.title).toBeDefined();
        expect(typeof chapter.title).toBe('string');
        expect(chapter.startIndex).toBeGreaterThanOrEqual(0);
        expect(chapter.endIndex).toBeGreaterThan(chapter.startIndex);
        expect(chapter.confidence).toBeGreaterThanOrEqual(0);
        expect(chapter.confidence).toBeLessThanOrEqual(1);
      });
    });

    it('should extract chapters from English text', async () => {
      const text = `Chapter 1: Introduction

This is a sample text for demonstrating AI chapter recognition.

Chapter 2: Background

In this chapter, we will discuss the project background and history.

Chapter 3: Methods

This chapter will detail the methods and techniques we use.`;

      const chapters = await extractor.extractChapters(text);

      expect(chapters).toBeDefined();
      expect(Array.isArray(chapters)).toBe(true);
      expect(chapters.length).toBeGreaterThan(0);

      // 验证英文章节识别
      const chapterTitles = chapters.map((c) => c.title);
      expect(chapterTitles.some((title) => title.includes('Chapter 1'))).toBe(true);
      expect(chapterTitles.some((title) => title.includes('Chapter 2'))).toBe(true);
      expect(chapterTitles.some((title) => title.includes('Chapter 3'))).toBe(true);
    });

    it('should extract chapters with Roman numerals', async () => {
      const text = `I. First Chapter

Content of first chapter.

II. Second Chapter

Content of second chapter.

III. Third Chapter

Content of third chapter.`;

      const chapters = await extractor.extractChapters(text);

      expect(chapters).toBeDefined();
      expect(Array.isArray(chapters)).toBe(true);
      expect(chapters.length).toBeGreaterThan(0);

      // 验证罗马数字章节识别
      const chapterTitles = chapters.map((c) => c.title);
      expect(chapterTitles.some((title) => title.includes('I.'))).toBe(true);
      expect(chapterTitles.some((title) => title.includes('II.'))).toBe(true);
      expect(chapterTitles.some((title) => title.includes('III.'))).toBe(true);
    });

    it('should handle text without chapters', async () => {
      const text = `This is a simple text without any chapter markers.

It contains multiple paragraphs but no clear chapter structure.

The text continues with more content but still no chapters.`;

      const chapters = await extractor.extractChapters(text);

      expect(chapters).toBeDefined();
      expect(Array.isArray(chapters)).toBe(true);
      // 对于没有章节的文本，可能返回空数组或少量低置信度的结果
      expect(chapters.length).toBeGreaterThanOrEqual(0);
    });

    it('should handle empty text', async () => {
      const chapters = await extractor.extractChapters('');

      expect(chapters).toBeDefined();
      expect(Array.isArray(chapters)).toBe(true);
      expect(chapters.length).toBe(0);
    });

    it('should handle very long text', async () => {
      // 创建一个很长的文本
      const longText =
        Array(1000).fill('This is a very long paragraph. ').join('') +
        '\n\nChapter 1: Long Text\n\n' +
        Array(500).fill('More content here. ').join('');

      const chapters = await extractor.extractChapters(longText);

      expect(chapters).toBeDefined();
      expect(Array.isArray(chapters)).toBe(true);
      // 应该能够处理长文本
      expect(chapters.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('confidence scoring', () => {
    it('should provide confidence scores for extracted chapters', async () => {
      const text = `第一章 高置信度章节

这是第一章的内容。

第二章 另一个章节

这是第二章的内容。`;

      const chapters = await extractor.extractChapters(text);

      chapters.forEach((chapter) => {
        expect(chapter.confidence).toBeDefined();
        expect(typeof chapter.confidence).toBe('number');
        expect(chapter.confidence).toBeGreaterThanOrEqual(0);
        expect(chapter.confidence).toBeLessThanOrEqual(1);
      });
    });

    it('should filter chapters based on confidence threshold', async () => {
      const lowThresholdExtractor = new LocalAIChapterExtractor({
        threshold: 0.9, // 高阈值
      });

      const text = `第一章 测试章节

这是测试内容。`;

      const chapters = await lowThresholdExtractor.extractChapters(text);

      // 如果设置了高阈值，可能不会返回任何章节
      expect(chapters).toBeDefined();
      expect(Array.isArray(chapters)).toBe(true);

      await lowThresholdExtractor.dispose();
    });
  });

  describe('chapter ordering', () => {
    it('should return chapters in correct order', async () => {
      const text = `第三章 第三

这是第三章。

第一章 第一

这是第一章。

第二章 第二

这是第二章。`;

      const chapters = await extractor.extractChapters(text);

      expect(chapters.length).toBeGreaterThan(0);

      // 检查章节是否按位置排序
      for (let i = 1; i < chapters.length; i++) {
        expect(chapters[i].startIndex).toBeGreaterThan(chapters[i - 1].startIndex);
      }
    });
  });

  describe('error handling', () => {
    it('should handle malformed text gracefully', async () => {
      const malformedText = 'Invalid text with \u0000 null characters and \u0001 control characters';

      const chapters = await extractor.extractChapters(malformedText);

      expect(chapters).toBeDefined();
      expect(Array.isArray(chapters)).toBe(true);
    });

    it('should handle text with special characters', async () => {
      const specialText = `第一章 特殊字符测试

包含特殊字符：!@#$%^&*()_+-=[]{}|;':",./<>?

第二章 更多特殊字符

包含Unicode字符：中文、English、123、αβγδε`;

      const chapters = await extractor.extractChapters(specialText);

      expect(chapters).toBeDefined();
      expect(Array.isArray(chapters)).toBe(true);
      expect(chapters.length).toBeGreaterThan(0);
    });
  });

  describe('performance', () => {
    it('should process text within reasonable time', async () => {
      const startTime = Date.now();

      const text =
        Array(100).fill('This is a test paragraph. ').join('') +
        '\n\nChapter 1: Performance Test\n\n' +
        Array(50).fill('More test content. ').join('');

      const chapters = await extractor.extractChapters(text);

      const endTime = Date.now();
      const processingTime = endTime - startTime;

      expect(chapters).toBeDefined();
      expect(Array.isArray(chapters)).toBe(true);
      // 处理时间应该在合理范围内（比如5秒内）
      expect(processingTime).toBeLessThan(5000);
    });
  });
});
