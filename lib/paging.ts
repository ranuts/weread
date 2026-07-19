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

/**
 * 排版倍率（阅读设置驱动）。相对基准（字号 18px / 行高 40px）缩放，默认 1 = 原始行为不变。
 * **必须与显示 CSS 用同一套倍率**（`--wr-font-scale` / `--wr-line-scale`），否则分页与实际渲染错位。
 * 行高同时乘 `fontScale`（字号变大行也变高，避免行重叠）与 `lineScale`（独立行距调节）。
 */
export interface Typography {
  fontScale: number;
  lineScale: number;
}

export const DEFAULT_TYPOGRAPHY: Typography = { fontScale: 1, lineScale: 1 };

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
 * 「单词字符」查表：`\w`（A-Za-z0-9_）+ 半角标点 `-.,!?;:'"()[]{}`，索引即 charCode（仅 ASCII，
 * >127 的 CJK/全角一律非单词——与原 `/[\w...]/.test(char)`（无 u 标志）行为一致）。
 * 全局构建一次，替代每字符跑一次正则（分页热路径的最大开销）。
 */
const WORD_PART = (() => {
  const table = new Uint8Array(128);
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-.,!?;:\'"()[]{}';
  for (let i = 0; i < chars.length; i++) table[chars.charCodeAt(i)] = 1;
  return table;
})();
const isWordCode = (code: number): boolean => code < 128 && WORD_PART[code] === 1;

/**
 * 按容器尺寸把一段文本分页。纯计算：只用 `dims` 与固定排版常量推导每行字符数/总行数，
 * 循环内不触碰 DOM。等价于原 `pagingText(content, container)`，但接收测量好的尺寸。
 *
 * 性能：热路径用 `charCodeAt` + 查表替正则；页文本用 `text.slice(pageStart, useChar)` 一次切出，
 * 不再逐字符 `+=` 拼超长字符串——大书（百万字）分页耗时数量级下降，行为逐字节不变。
 */
export const pagingTextCore = (content: string, dims: PagingDims, typography?: Typography): PagingTextResult => {
  const text = content.replace(/(?:\r\n|\r|\n)+/g, '\n') || '';
  const total = text.length;
  const { clientWidth, clientHeight } = dims;
  if (clientHeight < 30 || clientWidth < 30) {
    return { program: [], ...EMPTY_RESULT, total };
  }
  // 排版倍率（阅读设置）：默认 1，与显示 CSS 的 --wr-font-scale/--wr-line-scale 保持一致。
  const { fontScale, lineScale } = typography ?? DEFAULT_TYPOGRAPHY;
  // 字体大小，字体行高，字体间距，字体宽度（基准值 × 倍率；scale=1 时与原始常量逐位相同）
  const rootFontSize = 16;
  const fontSize = 1.125 * rootFontSize * fontScale; // 字体大小 text-lg
  const lineHeight = 0.25 * 10 * rootFontSize * fontScale * lineScale; // 行高：随字号 + 独立行距倍率
  const letterSpacing = 0.025 * rootFontSize * fontScale; // 字符间距（em）tracking-wide
  const charWidth = fontSize + letterSpacing; // 每个字符的宽度（px）
  const charsPerLine = Math.floor(clientWidth / charWidth); // 每行能容纳的字符数
  const totalLine = Math.floor(clientHeight / lineHeight); // 总行数
  const pageTotalChar = charsPerLine * totalLine; // 每页总字符数
  let useChar = 0;
  const result: PagingTextItem[] = [];

  // 查找下一个单词的结束位置
  const findNextWordEnd = (start: number): number => {
    let pos = start;
    let lastWordEnd = start;
    while (pos < total) {
      const code = text.charCodeAt(pos);
      if (isWordCode(code)) {
        pos++;
      } else if (code === 32) {
        lastWordEnd = pos;
        pos++;
        break;
      } else {
        pos++;
      }
    }
    return lastWordEnd;
  };

  // 查找当前单词的开始位置
  const findWordStart = (end: number): number => {
    let pos = end;
    let lastWordStart = end;
    while (pos > 0) {
      const code = text.charCodeAt(pos - 1);
      if (isWordCode(code)) {
        lastWordStart = pos - 1;
        pos--;
      } else if (code === 32) {
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
    const pageStart = useChar;
    let remainingChars = pageTotalChar;

    // 页文本 = text.slice(pageStart, useChar)：两个游标始终同步推进，无需逐字符拼接。
    while (currentLine < totalLine && currentChart < pageTotalChar && useChar < total) {
      const code = text.charCodeAt(useChar);

      if (code === 10 || code === 13) {
        currentLine++;
        currentChart = 0;
        useChar++;
        remainingChars--;
        continue;
      }

      const isWordPartChar = isWordCode(code);

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

      useChar++;
      currentChart += isWordPartChar ? 0.5625 : 1;
      remainingChars--;
    }

    // 检查是否在单词中间结束页面：整词放不下则回退到词首，把整词挪到下一页
    if (useChar < total && isWordCode(text.charCodeAt(useChar))) {
      const wordStart = findWordStart(useChar);
      const wordEnd = findNextWordEnd(useChar);
      if (wordEnd - wordStart > remainingChars) {
        useChar = wordStart;
      }
    }

    const size = result.length;
    result.push({
      text: text.slice(pageStart, useChar),
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
    item.start = index === 0 ? 0 : result[index - 1]?.end || 0;
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
  typography,
}: {
  text: string;
  dims: PagingDims;
  title: string;
  chapters: ChapterItem[];
  prefaceLabel: string;
  /** 排版倍率（阅读设置）；省略即默认 1。逐段分页时透传给 pagingTextCore。 */
  typography?: Typography;
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
    const result = pagingTextCore(
      item.section.replace(CHAPTER_TITLE_START, '').replace(CHAPTER_TITLE_END, ''),
      dims,
      typography,
    );
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
