import jschardet from 'jschardet';
import { Locales, t } from '@/locales';
import { detectChapters } from '@/lib/chapter';
import { buildTextSyntaxTree, pagingTextCore } from '@/lib/paging';
import type { Typography } from '@/lib/paging';

export interface TransformText {
  encoding: string;
  content: string;
}

export const transformText = (content: string | ArrayBuffer): TransformText | undefined => {
  if (content instanceof ArrayBuffer) {
    const uint8Array = new Uint8Array(content);
    const asciiString = String.fromCharCode.apply(null, uint8Array as unknown as number[]);
    const detected = jschardet.detect(asciiString);
    const encoding = detected.encoding || 'utf-8';
    const text = new TextDecoder(encoding).decode(content);
    if (detected.encoding && text) {
      return {
        encoding: detected.encoding,
        content: text,
      };
    }
  } else {
    console.error('Unexpected result type:', typeof content);
  }
};

export const arrayBufferToString = (arrayBuffer: ArrayBuffer | Uint8Array<ArrayBuffer>): string => {
  const uint8Array = new Uint8Array(arrayBuffer);
  const encoding = checkEncoding(uint8Array);
  const textDecoder = new TextDecoder(encoding);
  return textDecoder.decode(uint8Array);
};

export const checkEncoding = (uint8Array: Uint8Array): string => {
  // 将 Uint8Array 转换为字符串
  const asciiString = Array.from(uint8Array)
    .map((byte) => String.fromCharCode(byte))
    .join('');
  const detected = jschardet.detect(asciiString);
  return detected.encoding || 'utf-8';
};

export const createReader = (file: File): Promise<Uint8Array<ArrayBuffer>> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsArrayBuffer(file);
    reader.onload = () => {
      if (reader.result) {
        const uint8Array = new Uint8Array(reader.result as ArrayBuffer);
        resolve(uint8Array);
      }
    };
    reader.onerror = (error) => {
      reject(error);
    };
    reader.onabort = (abort) => {
      reject(abort);
    };
  });
};

export interface PagingText {
  total: number;
  totalLine: number;
  fontSize: number;
  lineHeight: number;
  letterSpacing: number;
  charWidth: number;
  charsPerLine: number;
  pageTotalChar: number;
}

export interface PagingTextItem extends PagingText {
  text: string;
  start: number;
  end: number;
  index: number;
}

export interface PagingTextResult extends PagingText {
  program: PagingTextItem[];
}

export const CHAPTER_TITLE_START = '<caption-title>';

export const CHAPTER_TITLE_END = '</caption-title>';

export const CHAPTER_TITLE_CONTENT = '*';

// 根据不同的语言计算不同的字体大小
export const getFontSize = (): number => {
  // eslint-disable-next-line n/no-unsupported-features/node-builtins
  const language = navigator?.language || Locales.en;
  if (language === Locales['zh-CN']) {
    return 1.125;
  }
  return 1.125;
};
/**
 * @description: 将文本转换成语法树
 * @param {string} content 文本内容
 * @param {HTMLElement} container 容器
 * @param {ChapterItem} extractedChapters 目录
 * @return {PagingTextResult}
 */
export const pagingText = (content: string, container: HTMLElement): PagingTextResult =>
  pagingTextCore(content, { clientWidth: container?.clientWidth ?? 0, clientHeight: container?.clientHeight ?? 0 });

export interface ChapterItem {
  title: string;
  start: number;
  end?: number;
  pageNum?: number;
}

export const toString = (value: unknown): string => {
  return value == null ? '' : String(value);
};

export const trim = (value: string): string => {
  return toString(value).trim();
};

export const extractCaptionTitleChapters = (text: string): ChapterItem[] => {
  const captionTitleRegex = /<caption-title>([\s\S]*?)<\/caption-title>/g;
  const chapters: ChapterItem[] = [];
  let match;

  while ((match = captionTitleRegex.exec(text)) != null) {
    chapters.push({ title: trim(match[1]), start: match.index });
  }

  // 设置每个章节的结束位置
  chapters.forEach((chapter, index) => {
    const nextChapter = chapters[index + 1];
    chapter.end = nextChapter ? nextChapter.start : text.length;
  });

  return chapters;
};

export interface Section {
  title: string;
  section: string;
}

export interface Sequence {
  title: string;
  result: PagingTextResult;
  titleId: number;
}

export interface TextSyntaxTree {
  sequences: Sequence[];
  totalPage: number;
  pageText: PagingTextItem[];
  pageTitleId: number[];
  titleIdTitle: string[];
  titleIdPage: Record<string, number>;
}

// 处理文本成期望的格式：
export const transformTextToExpectedFormat = ({
  content,
  container,
  title,
  chapters,
  typography,
}: {
  content: ArrayBuffer | Uint8Array<ArrayBuffer>;
  container: HTMLElement;
  title: string;
  /** 预计算的章节（来自缓存或模型增强），传入时跳过内部识别；空数组表示已确认无章节 */
  chapters?: ChapterItem[];
  /** 排版倍率（阅读设置：字号/行距）；省略即默认 1，与显示 CSS 同步。 */
  typography?: Typography;
}): TextSyntaxTree => {
  // 1. 过滤空格换行
  const text = arrayBufferToString(content).replace(/(?:\r\n|\r|\n)+/g, '\n') || '';
  // 2. 提取章节标题：优先使用预计算结果，其次 <caption-title> 标注，最后规则自动识别
  let extractedChapters: ChapterItem[];
  if (chapters) {
    extractedChapters = chapters;
  } else {
    extractedChapters = extractCaptionTitleChapters(text);
    if (extractedChapters.length === 0) {
      extractedChapters = detectChapters(text);
    }
  }
  // 3~5. 切段 + 分页 + 建树：交给纯核心（与分页 Worker 同一份实现）。
  return buildTextSyntaxTree({
    text,
    dims: { clientWidth: container?.clientWidth ?? 0, clientHeight: container?.clientHeight ?? 0 },
    title,
    chapters: extractedChapters,
    prefaceLabel: t('preface'),
    typography,
  });
};
