import { describe, expect, it } from 'vitest';
import { detectChapters, detectChaptersDetailed, parseChineseNumber, parseRomanNumber } from '../index';

/** 中文正文填充：短句行，不命中任何标题模式 */
const filler = (chars: number): string => {
  const sentence = '春天的风从山谷里吹过来，带着潮湿的泥土气息，她沿着旧铁轨慢慢往前走。';
  let out = '';
  while (out.length < chars) {
    out += sentence + '\n';
  }
  return out;
};

/** 英文正文填充：行长超过标题上限，直接被行长过滤跳过 */
const fillerEn = (chars: number): string => {
  const sentence = 'The wind was cold and the road stretched far beyond the quiet hills of the north.';
  let out = '';
  while (out.length < chars) {
    out += sentence + '\n';
  }
  return out;
};

describe('detectChapters 中文章节', () => {
  it('识别「第X章 标题」并给出正确边界', () => {
    const text = [
      filler(300),
      '第一章 风雪夜',
      filler(400),
      '第二章 山路',
      filler(400),
      '第三章 灯火',
      filler(400),
    ].join('\n');
    const chapters = detectChapters(text);
    expect(chapters.map((chapter) => chapter.title)).toEqual(['第一章 风雪夜', '第二章 山路', '第三章 灯火']);
    // 边界成链：每章 end 是下一章 start，最后一章到文本末尾
    expect(chapters[0].end).toBe(chapters[1].start);
    expect(chapters[1].end).toBe(chapters[2].start);
    expect(chapters[2].end).toBe(text.length);
    expect(chapters[0].start).toBe(text.indexOf('第一章'));
  });

  it('以章节词开头的正文短句不会误报', () => {
    const noise = '第三章的内容他没看';
    const text = [
      filler(300),
      '第一章 风雪夜',
      filler(200),
      noise,
      filler(200),
      '第二章 山路',
      filler(400),
      '第三章 灯火',
      filler(400),
    ].join('\n');
    const chapters = detectChapters(text);
    expect(chapters.map((chapter) => chapter.title)).toEqual(['第一章 风雪夜', '第二章 山路', '第三章 灯火']);
  });

  it('文件开头的目录页输给正文里的真实章节行', () => {
    const toc = ['第一章 风雪夜', '第二章 山路', '第三章 灯火', '第四章 归途', '第五章 远方'].join('\n');
    const body = ['第一章 风雪夜', '第二章 山路', '第三章 灯火', '第四章 归途', '第五章 远方']
      .map((title) => `${title}\n${filler(400)}`)
      .join('\n');
    const text = `${toc}\n${filler(300)}\n${body}`;
    const chapters = detectChapters(text);
    expect(chapters).toHaveLength(5);
    expect(chapters[0].start).toBe(text.lastIndexOf('第一章 风雪夜'));
  });

  it('序章/番外/后记等特殊章节并入结果', () => {
    const text = [
      '序章',
      filler(400),
      '第一章 起点',
      filler(400),
      '第二章 转折',
      filler(400),
      '第三章 结局',
      filler(400),
      '番外 若干年后',
      filler(400),
      '后记',
      filler(300),
    ].join('\n');
    const chapters = detectChapters(text);
    expect(chapters.map((chapter) => chapter.title)).toEqual([
      '序章',
      '第一章 起点',
      '第二章 转折',
      '第三章 结局',
      '番外 若干年后',
      '后记',
    ]);
  });

  it('识别「一、」式编号', () => {
    const text = [filler(250), '一、初见', filler(400), '二、重逢', filler(400), '三、离别', filler(400)].join('\n');
    const chapters = detectChapters(text);
    expect(chapters.map((chapter) => chapter.title)).toEqual(['一、初见', '二、重逢', '三、离别']);
  });
});

describe('detectChapters 英文与罗马数字', () => {
  it('识别 Chapter N 及数词、罗马编号', () => {
    const text = [
      fillerEn(300),
      'Chapter 1: The Beginning',
      fillerEn(400),
      'Chapter 2: The Road',
      fillerEn(400),
      'Chapter 3: The End',
      fillerEn(400),
    ].join('\n');
    const chapters = detectChapters(text);
    expect(chapters.map((chapter) => chapter.title)).toEqual([
      'Chapter 1: The Beginning',
      'Chapter 2: The Road',
      'Chapter 3: The End',
    ]);
  });

  it('识别罗马数字独立成行', () => {
    const text = ['I', fillerEn(400), 'II', fillerEn(400), 'III', fillerEn(400), 'IV', fillerEn(400)].join('\n');
    const chapters = detectChapters(text);
    expect(chapters.map((chapter) => chapter.title)).toEqual(['I', 'II', 'III', 'IV']);
  });
});

describe('detectChapters 抗噪与兜底', () => {
  it('无任何章节格式时返回空数组', () => {
    expect(detectChapters(filler(2000))).toEqual([]);
  });

  it('紧凑的编号列表不会被当成章节', () => {
    const list = ['1. 苹果', '2. 香蕉', '3. 橙子', '4. 葡萄'].join('\n');
    const text = `${filler(400)}\n${list}\n${filler(400)}`;
    expect(detectChapters(text)).toEqual([]);
  });

  it('章节只挤在文本开头的极小前缀时判定失败', () => {
    const text = ['第一章 开头', filler(220), '第二章 然后', filler(220), filler(5000)].join('\n');
    expect(detectChapters(text)).toEqual([]);
  });
});

describe('detectChaptersDetailed 置信度', () => {
  it('编号连贯的书为 high', () => {
    const text = [filler(300), '第一章 起点', filler(400), '第二章 转折', filler(400), '第三章 结局', filler(400)].join(
      '\n',
    );
    const detection = detectChaptersDetailed(text);
    expect(detection.confidence).toBe('high');
    expect(detection.familyId).toBe('cn-chapter');
  });

  it('无格式文本为 none', () => {
    const detection = detectChaptersDetailed(filler(2000));
    expect(detection.confidence).toBe('none');
    expect(detection.chapters).toEqual([]);
  });

  it('少于 3 章为 low', () => {
    const text = [filler(300), '第一章 起点', filler(400), '第二章 结局', filler(400)].join('\n');
    const detection = detectChaptersDetailed(text);
    expect(detection.chapters).toHaveLength(2);
    expect(detection.confidence).toBe('low');
  });

  it('编号断裂一半为 medium', () => {
    const text = [
      filler(300),
      '第一章 起点',
      filler(400),
      '第二章 前行',
      filler(400),
      '第四章 迷途',
      filler(400),
      '第五章 转折',
      filler(400),
      '第七章 结局',
      filler(400),
    ].join('\n');
    const detection = detectChaptersDetailed(text);
    expect(detection.chapters).toHaveLength(5);
    expect(detection.confidence).toBe('medium');
  });
});

describe('数字解析', () => {
  it('中文数字', () => {
    expect(parseChineseNumber('十五')).toBe(15);
    expect(parseChineseNumber('二十三')).toBe(23);
    expect(parseChineseNumber('一百零三')).toBe(103);
    expect(parseChineseNumber('两百')).toBe(200);
    expect(parseChineseNumber('一千零一')).toBe(1001);
    expect(parseChineseNumber('三万')).toBe(30000);
    expect(parseChineseNumber('12')).toBe(12);
    expect(parseChineseNumber('１２')).toBe(12);
    expect(parseChineseNumber('abc')).toBeNull();
  });

  it('罗马数字', () => {
    expect(parseRomanNumber('IV')).toBe(4);
    expect(parseRomanNumber('XIX')).toBe(19);
    expect(parseRomanNumber('iv')).toBe(4);
    expect(parseRomanNumber('ABC')).toBeNull();
  });
});
