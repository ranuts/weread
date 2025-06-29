import { AIChapterExtractor, extractChaptersWithAI } from '@/lib/aiChapterExtractor';

// 测试用例：不同格式的文本
const testCases = [
  {
    name: '中文章节格式',
    text: `
前言

第一章 开始
这是第一章的内容。

第二章 发展
这是第二章的内容。

第三章 结束
这是第三章的内容。
    `,
    expectedChapters: 3,
  },
  {
    name: '英文章节格式',
    text: `
Introduction

Chapter 1: The Beginning
This is the content of chapter 1.

Chapter 2: The Middle
This is the content of chapter 2.

Chapter 3: The End
This is the content of chapter 3.
    `,
    expectedChapters: 3,
  },
  {
    name: '罗马数字格式',
    text: `
Preface

I. First Chapter
Content of first chapter.

II. Second Chapter
Content of second chapter.

III. Third Chapter
Content of third chapter.
    `,
    expectedChapters: 3,
  },
  {
    name: '特殊标记格式',
    text: `
Introduction

*** Chapter One ***
Content of chapter one.

--- Chapter Two ---
Content of chapter two.

=== Chapter Three ===
Content of chapter three.
    `,
    expectedChapters: 3,
  },
  {
    name: '无章节标记的文本',
    text: `
这是一段没有明显章节标记的文本。
它可能包含多个段落，但没有标准的章节标题。

第二段内容。
这里可能有一些数字或者特殊符号。

第三段内容。
文本继续，但没有明确的章节结构。
    `,
    expectedChapters: 0,
  },
];

// 测试函数
export const testAIChapterExtractor = async (): Promise<void> => {
  console.log('🧪 开始测试 AI 章节提取功能...\n');

  for (const testCase of testCases) {
    console.log(`📖 测试：${testCase.name}`);

    try {
      const chapters = await extractChaptersWithAI(testCase.text);

      console.log(`   找到章节数：${chapters.length}`);
      console.log(`   期望章节数：${testCase.expectedChapters}`);

      if (chapters.length > 0) {
        console.log('   章节列表：');
        chapters.forEach((chapter, index) => {
          console.log(`     ${index + 1}. "${chapter.title}" (位置：${chapter.start}-${chapter.end})`);
        });
      }

      console.log(`   结果：${chapters.length >= testCase.expectedChapters ? '✅ 通过' : '❌ 失败'}\n`);
    } catch (error) {
      console.log(`   ❌ 错误：${error}\n`);
    }
  }
};

// 实际使用示例
export const demonstrateUsage = async (): Promise<void> => {
  console.log('🚀 AI 章节提取功能使用示例\n');

  // 示例 1: 基本使用
  console.log('1️⃣ 基本使用：');
  const text1 = `
第一章 引言
这是第一章的内容。

第二章 正文
这是第二章的内容。
  `;

  const chapters1 = await extractChaptersWithAI(text1);
  console.log(`   找到 ${chapters1.length} 个章节`);
  chapters1.forEach((chapter) => {
    console.log(`   - ${chapter.title}`);
  });
  console.log();

  // 示例 2: 自定义配置
  console.log('2️⃣ 自定义配置：');
  const extractor = new AIChapterExtractor({
    confidenceThreshold: 0.8,
    maxChapters: 50,
  });

  const chapters2 = await extractor.extractChapters(text1);
  console.log(`   使用自定义配置找到 ${chapters2.length} 个章节`);
  console.log();

  // 示例 3: 处理复杂文本
  console.log('3️⃣ 处理复杂文本：');
  const complexText = `
前言：本书介绍...

第一部分：基础理论
第一章 基本概念
第二章 核心原理

第二部分：实践应用
第三章 案例分析
第四章 总结展望

附录：参考资料
  `;

  const chapters3 = await extractChaptersWithAI(complexText);
  console.log(`   复杂文本中找到 ${chapters3.length} 个章节`);
  chapters3.forEach((chapter) => {
    console.log(`   - ${chapter.title}`);
  });
  console.log();
};

// 性能测试
export const performanceTest = async (): Promise<void> => {
  console.log('⚡ 性能测试\n');

  // 生成大文本
  const generateLargeText = (size: number) => {
    let text = '';
    for (let i = 1; i <= size; i++) {
      text += `第${i}章 章节${i}\n`;
      text += `这是第${i}章的内容。`.repeat(100) + '\n\n';
    }
    return text;
  };

  const sizes = [10, 50, 100];

  for (const size of sizes) {
    console.log(`📊 测试 ${size} 个章节的文本:`);

    const text = generateLargeText(size);
    const startTime = performance.now();

    try {
      const chapters = await extractChaptersWithAI(text);
      const endTime = performance.now();

      console.log(`   文本大小: ${(text.length / 1024).toFixed(2)} KB`);
      console.log(`   找到章节: ${chapters.length}`);
      console.log(`   处理时间: ${(endTime - startTime).toFixed(2)} ms`);
      console.log(`   处理速度: ${(text.length / (endTime - startTime)).toFixed(0)} 字符/ms\n`);
    } catch (error) {
      console.log(`   ❌ 错误: ${error}\n`);
    }
  }
};

// 导出所有测试函数
export const runAllTests = async (): Promise<void> => {
  await testAIChapterExtractor();
  await demonstrateUsage();
  await performanceTest();

  console.log('🎉 所有测试完成！');
};

// 如果直接运行此文件
if (typeof window !== 'undefined') {
  // 在浏览器环境中，可以添加到全局对象
  (window as any).testAIChapterExtractor = runAllTests;
}
