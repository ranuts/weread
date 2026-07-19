/**
 * 纯分页核心（无 DOM / 无 locales / 无副作用）——主线程包装器与分页 Worker 共用。
 *
 * 关键事实：整套分页只在**开头读一次容器的 clientWidth/clientHeight**，之后全是纯字符
 * 计算。故把这两个尺寸传进来即可脱离 DOM，在 Worker 里跑而不冻结主线程。
 * 类型从 transformText 以 `import type` 引入（编译期擦除，不产生运行时依赖）。
 */
import type {
  ChapterItem,
  PagingTextItem,
  PagingTextResult,
  Section,
  Sequence,
  TextSyntaxTree,
} from '@/lib/transformText';

/** 容器测量结果（替代直接读 HTMLElement）。 */
export interface PagingDims {
  clientWidth: number;
  clientHeight: number;
}

const CHAPTER_TITLE_START = '<caption-title>';
const CHAPTER_TITLE_END = '</caption-title>';

const EMPTY_RESULT: Omit<PagingTextResult, 'program'> = {
  total: 0,
  totalLine: 0,
  fontSize: 0,
  lineHeight: 0,
  letterSpacing: 0,
  charWidth: 0,
  charsPerLine: 0,
  pageTotalChar: 0,
};

/**
 * 按容器尺寸把一段文本分页。纯计算：只用 `dims` 与固定排版常量推导每行字符数/总行数，
 * 循环内不触碰 DOM。等价于原 `pagingText(content, container)`，但接收测量好的尺寸。
 */
export const pagingTextCore = (content: string, dims: PagingDims): PagingTextResult => {
  const text = content.replace(/(?:\r\n|\r|\n)+/g, '\n') || '';
  const total = text.length;
  const { clientWidth, clientHeight } = dims;
  if (clientHeight < 30 || clientWidth < 30) {
    return { program: [], ...EMPTY_RESULT, total };
  }
  // 字体大小，字体行高，字体间距，字体宽度
  const rootFontSize = 16;
  const fontSize = 1.125 * rootFontSize; // 字体大小 text-lg
  const lineHeight = 0.25 * 10 * rootFontSize; // 行高（倍数）leading-10
  const letterSpacing = 0.025 * rootFontSize; // 字符间距（em）tracking-wide
  const charWidth = fontSize + letterSpacing; // 每个字符的宽度（px）
  const charsPerLine = Math.floor(clientWidth / charWidth); // 每行能容纳的字符数
  const totalLine = Math.floor(clientHeight / lineHeight); // 总行数
  const pageTotalChar = charsPerLine * totalLine; // 每页总字符数
  let useChar = 0;
  const result: PagingTextItem[] = [];

  // 辅助函数：检查是否是英文单词的一部分（包括连字符和半角字符）
  const isWordPart = (char: string): boolean => {
    return /[\w\-.,!?;:'"()[\]{}]/.test(char);
  };

  // 辅助函数：查找下一个单词的结束位置
  const findNextWordEnd = (start: number): number => {
    let pos = start;
    let lastWordEnd = start;
    while (pos < total) {
      const char = text[pos];
      if (isWordPart(char)) {
        pos++;
      } else if (char === ' ') {
        lastWordEnd = pos;
        pos++;
        break;
      } else {
        pos++;
      }
    }
    return lastWordEnd;
  };

  // 辅助函数：查找当前单词的开始位置
  const findWordStart = (end: number): number => {
    let pos = end;
    let lastWordStart = end;
    while (pos > 0) {
      const char = text[pos - 1];
      if (isWordPart(char)) {
        lastWordStart = pos - 1;
        pos--;
      } else if (char === ' ') {
        break;
      } else {
        pos--;
      }
    }
    return lastWordStart;
  };

  while (total > useChar) {
    let currentLine = 0;
    let currentChart = 0;
    let currentText = '';
    const pageStart = useChar;
    let remainingChars = pageTotalChar;

    while (currentLine < totalLine && currentChart < pageTotalChar && useChar < total) {
      const char = text[useChar];

      if (char === '\n' || char === '\r') {
        currentLine++;
        currentChart = 0;
        currentText += char;
        useChar++;
        remainingChars--;
        continue;
      }

      const isWordPartChar = isWordPart(char);

      if (currentChart >= charsPerLine) {
        if (isWordPartChar) {
          const wordStart = findWordStart(useChar);
          const wordEnd = findNextWordEnd(useChar);
          if (wordEnd - wordStart > charsPerLine) {
            currentLine++;
            currentChart = 0;
            continue;
          }
        }
        currentLine++;
        currentChart = 0;
        continue;
      }

      currentText += char;
      useChar++;
      if (isWordPart(char)) {
        currentChart += 0.5625;
      } else {
        currentChart++;
      }
      remainingChars--;
    }

    // 检查是否在单词中间结束页面
    if (useChar < total) {
      const nextChar = text[useChar];
      if (isWordPart(nextChar)) {
        const wordStart = findWordStart(useChar);
        const wordEnd = findNextWordEnd(useChar);
        const wordLength = wordEnd - wordStart;
        if (wordLength > remainingChars) {
          currentText = currentText.slice(0, wordStart - pageStart);
          useChar = wordStart;
        }
      }
    }

    const size = result.length;
    result.push({
      text: currentText,
      start: pageStart,
      end: useChar,
      index: size,
      total,
      totalLine,
      fontSize,
      lineHeight,
      letterSpacing,
      charWidth,
      charsPerLine,
      pageTotalChar,
    });
  }

  result.forEach((item, index) => {
    if (index === 0) {
      item.start = 0;
    }
    item.start = result[index - 1]?.end || 0;
  });

  return {
    program: result,
    total,
    totalLine,
    fontSize,
    lineHeight,
    letterSpacing,
    charWidth,
    charsPerLine,
    pageTotalChar,
  };
};

/**
 * 纯语法树构建：章节切段 → 逐段分页 → 建 page/title 映射。等价于 `transformTextToExpectedFormat`
 * 的「切段 + 分页 + 建树」部分，但接收测量好的 `dims` 与已解析的 `chapters`（不做章节识别、
 * 不依赖 locales——preface 文案由 `prefaceLabel` 传入）。
 */
export const buildTextSyntaxTree = ({
  text: rawText,
  dims,
  title,
  chapters,
  prefaceLabel,
}: {
  text: string;
  dims: PagingDims;
  title: string;
  chapters: ChapterItem[];
  prefaceLabel: string;
}): TextSyntaxTree => {
  const text = rawText.replace(/(?:\r\n|\r|\n)+/g, '\n') || '';

  // 章节切段（首章前若有正文，补一段 preface）
  const sections: Section[] = [];
  chapters.forEach((item, index) => {
    const { start, end, title: chapterTitle } = item;
    if (index === 0 && start > 0) {
      sections.push({ title: prefaceLabel, section: text.slice(0, start) });
    }
    sections.push({ title: chapterTitle, section: text.slice(start, end) });
  });
  if (chapters.length === 0) {
    sections.push({ title, section: text });
  }

  if (dims.clientWidth < 30 || dims.clientHeight < 30) {
    return { sequences: [], totalPage: 0, pageText: [], pageTitleId: [], titleIdTitle: [], titleIdPage: {} };
  }

  const sequences: Sequence[] = [];
  sections.forEach((item, index) => {
    const result = pagingTextCore(item.section.replace(CHAPTER_TITLE_START, '').replace(CHAPTER_TITLE_END, ''), dims);
    sequences.push({ title: item.title, result, titleId: index });
  });

  let totalPage = 0;
  const pageText: PagingTextItem[] = [];
  const pageTitleId: number[] = [];
  const titleIdTitle: string[] = [];
  const titleIdPage: Record<string, number> = {};
  sequences.forEach((item) => {
    totalPage += item.result.program.length;
    item.result.program.forEach((page) => {
      // 必须与 undefined 比较：首章首页页码 0 用 falsy 判断会被当成未赋值
      if (titleIdPage[item.titleId] === undefined) {
        titleIdPage[item.titleId] = pageText.length;
      }
      pageTitleId.push(item.titleId);
      pageText.push(page);
    });
    titleIdTitle.push(item.title);
  });

  return { sequences, totalPage, pageText, pageTitleId, titleIdTitle, titleIdPage };
};
