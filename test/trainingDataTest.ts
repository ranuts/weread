

// 简化的训练数据生成测试
async function testTrainingDataGeneration() {
  console.log('Testing training data generation logic...');
  
  // 模拟训练数据生成逻辑
  const books = [
    { 
      name: 'princekin', 
      path: './assets/books/princekin/princekin.txt', 
      language: 'chinese',
      chapters: [
        '  I ', '  II ', '  III ', '  IV ', '  V ', '  VI ', '  VII ', '  VIII ', '  IX ', '  X ',
        '  XI ', '  XII ', '  XIII ', '  XIV ', '  XV ', '  XVI ', '  XVII ', '  XVIII ', '  XIX ', '  XX ',
        '  XXI ', '  XXII ', '  XXIII ', '  XXIV ', '  XXV ', '  XXVI ', '  XXVII '
      ]
    }
  ];
  
  const trainingData: Array<{text: string, isChapter: boolean}> = [];
  
  for (const book of books) {
    console.log(`Processing book: ${book.name}`);
    
    // 生成正样本（预定义的章节标题）
    for (const chapter of book.chapters) {
      trainingData.push({
        text: chapter,
        isChapter: true
      });
      
      // 数据增强：创建章节标题的变体
      const variants = generateChapterVariants(chapter);
      for (const variant of variants) {
        trainingData.push({
          text: variant,
          isChapter: true
        });
      }
    }
    
    console.log(`Book ${book.name} processed: ${book.chapters.length} chapters`);
  }
  
  console.log(`Total training samples: ${trainingData.length}`);
  console.log(`Positive samples: ${trainingData.filter(d => d.isChapter).length}`);
  
  // 显示一些正样本示例
  const positiveSamples = trainingData.filter(d => d.isChapter).slice(0, 15);
  console.log('\nPositive sample examples:');
  positiveSamples.forEach((sample, i) => {
    console.log(`${i + 1}. "${sample.text}"`);
  });
  
  // 检查 princekin 的章节是否在训练数据中
  const princekinChapters = [
    'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X',
    'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX',
    'XXI', 'XXII', 'XXIII', 'XXIV', 'XXV', 'XXVI', 'XXVII'
  ];
  
  console.log('\nChecking princekin chapters in training data:');
  princekinChapters.forEach(chapter => {
    const found = trainingData.some(d => d.isChapter && d.text.includes(chapter));
    console.log(`${chapter}: ${found ? '✓' : '✗'}`);
  });
  
  console.log('\nTraining data generation test completed successfully!');
}

// 生成章节标题的变体
function generateChapterVariants(chapter: string): string[] {
  const variants: string[] = [];
  const trimmed = chapter.trim();
  
  // 添加空格变体
  if (!trimmed.startsWith(' ')) {
    variants.push(' ' + trimmed);
  }
  if (!trimmed.endsWith(' ')) {
    variants.push(trimmed + ' ');
  }
  if (!trimmed.startsWith(' ') && !trimmed.endsWith(' ')) {
    variants.push(' ' + trimmed + ' ');
  }
  
  // 对于罗马数字，添加点号变体
  if (/^[IVX]+$/.test(trimmed)) {
    variants.push(trimmed + '.');
    variants.push(trimmed + ' .');
    variants.push(' ' + trimmed + '.');
  }
  
  // 对于英文章节，添加大小写变体
  if (trimmed.match(/^Chapter\s+\d+/i)) {
    variants.push(trimmed.toLowerCase());
    variants.push(trimmed.toUpperCase());
  }
  
  return variants;
}

// 运行测试
testTrainingDataGeneration().catch(console.error); 