/**
 * 章节标题模式库。
 * 每个 PatternFamily 描述一类标题格式，regex 作用于「去除首尾空白后的单行」。
 * numbered 家族通过 parseSeq 提取编号，供全局验证做递增序列检查；
 * unnumbered 家族（特殊章节、括号标题）只能靠数量与间距验证，优先级更低。
 */

export interface PatternFamily {
  id: string;
  regex: RegExp;
  /** 从 regex 匹配结果中解析章节编号，无编号家族不提供 */
  parseSeq?: (match: RegExpMatchArray) => number | null;
  /** 特殊章节（序章/番外/后记等），不参与家族竞争，仅并入胜出家族 */
  special?: boolean;
}

const CN_DIGITS: Record<string, number> = {
  零: 0,
  〇: 0,
  一: 1,
  二: 2,
  两: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
};

const CN_UNITS: Record<string, number> = {
  十: 10,
  百: 100,
  千: 1000,
};

/** 全角数字转半角 */
const toHalfWidth = (value: string): string => {
  return value.replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0));
};

/**
 * 中文数字转阿拉伯数字，支持「十五」「二十三」「一百零三」「一千零一」「三万」等。
 * 混入无法识别的字符时返回 null。
 */
export const parseChineseNumber = (value: string): number | null => {
  const text = toHalfWidth(value.trim());
  if (/^\d+$/.test(text)) {
    return Number.parseInt(text, 10);
  }
  let result = 0;
  let section = 0;
  let current = 0;
  for (const char of text) {
    if (CN_DIGITS[char] !== undefined) {
      current = CN_DIGITS[char];
    } else if (CN_UNITS[char] !== undefined) {
      // 「十五」的「十」前面没有数字，按 1 处理
      section += (current || (char === '十' ? 1 : 0)) * CN_UNITS[char];
      current = 0;
    } else if (char === '万' || char === '萬') {
      result = (result + section + current) * 10000;
      section = 0;
      current = 0;
    } else {
      return null;
    }
  }
  return result + section + current;
};

const ROMAN_VALUES: Record<string, number> = {
  I: 1,
  V: 5,
  X: 10,
  L: 50,
  C: 100,
  D: 500,
  M: 1000,
};

/** 罗马数字转阿拉伯数字，非法输入返回 null */
export const parseRomanNumber = (value: string): number | null => {
  const text = value.trim().toUpperCase();
  if (!/^[IVXLCDM]+$/.test(text)) {
    return null;
  }
  let result = 0;
  for (let i = 0; i < text.length; i++) {
    const current = ROMAN_VALUES[text[i]];
    const next = ROMAN_VALUES[text[i + 1]];
    if (next && current < next) {
      result -= current;
    } else {
      result += current;
    }
  }
  return result;
};

const EN_NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
};

/** 英文序号：阿拉伯数字 / 罗马数字 / 英文数词 */
const parseEnglishSeq = (value: string): number | null => {
  const text = value.trim().toLowerCase();
  if (/^\d+$/.test(text)) {
    return Number.parseInt(text, 10);
  }
  if (EN_NUMBER_WORDS[text] !== undefined) {
    return EN_NUMBER_WORDS[text];
  }
  return parseRomanNumber(text);
};

/**
 * 模式说明：
 * - cn-chapter：「第X章 标题」。编号后必须是分隔符或行尾，
 *   避免「第三章的内容他没看」这类以章节词开头的正文短句误报。
 * - en-chapter：「Chapter 1: Title」「PART IV」等。
 * - cn-enum / num-enum：「一、标题」「1. 标题」。num-enum 噪声较大（易命中列表），
 *   依赖全局验证的序列与间距检查兜底。
 * - roman-line：罗马数字独立成行（仅大写，降低误报）。
 * - cn-special：序章/楔子/番外/后记等无编号特殊章节。
 * - bracket：「【标题】」，无编号，仅在没有任何 numbered 家族胜出时启用。
 */
export const PATTERN_FAMILIES: PatternFamily[] = [
  {
    id: 'cn-chapter',
    regex:
      /^第\s*([0-9０-９一二两三四五六七八九十百千万萬零〇]{1,12})\s*[章节節卷巻回部集话話篇幕册冊](?:[：:.．、\-—\s].{0,40})?$/,
    parseSeq: (match) => parseChineseNumber(match[1]),
  },
  {
    id: 'en-chapter',
    regex:
      /^(?:chapter|section|part|book|act)\s+(\d{1,4}|[ivxlcdm]{1,7}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\b(?:[：:.．\-—\s].{0,50})?$/i,
    parseSeq: (match) => parseEnglishSeq(match[1]),
  },
  {
    id: 'cn-enum',
    regex: /^([一二两三四五六七八九十百千]{1,8})[、.．：:]\s*\S.{0,40}$/,
    parseSeq: (match) => parseChineseNumber(match[1]),
  },
  {
    id: 'num-enum',
    regex: /^([0-9０-９]{1,4})[、.．：:]\s*\S.{0,40}$/,
    parseSeq: (match) => Number.parseInt(toHalfWidth(match[1]), 10),
  },
  {
    id: 'roman-line',
    regex: /^([IVXLCDM]{1,7})(?:[.．：:\s].{0,40})?$/,
    parseSeq: (match) => parseRomanNumber(match[1]),
  },
  {
    id: 'cn-special',
    regex:
      /^(?:序章|序言|自序|代序|楔子|引子|前言|导读|導讀|后记|後記|尾声|尾聲|终章|終章|完本感言|作品相关|内容简介|內容簡介|番外(?:[：:.．、\s].{0,30}|[一二三四五六七八九十0-9]{0,3})?)$/,
    special: true,
  },
  {
    id: 'bracket',
    regex: /^[【[]\s*(.{1,30}?)\s*[】\]]$/,
  },
];
