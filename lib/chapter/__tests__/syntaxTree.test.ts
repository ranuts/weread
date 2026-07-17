import { describe, expect, it } from 'vitest';
import { transformTextToExpectedFormat } from '@/lib/transformText';

/** pagingText 只读取 container 的 clientWidth/clientHeight，用最小对象即可驱动分页 */
const fakeContainer = { clientWidth: 800, clientHeight: 600 } as HTMLElement;

const filler = (chars: number): string => {
  const sentence = '春天的风从山谷里吹过来，带着潮湿的泥土气息，她沿着旧铁轨慢慢往前走。';
  let out = '';
  while (out.length < chars) {
    out += sentence + '\n';
  }
  return out;
};

// 序言必须跨多页：titleIdPage 的 falsy 判断 bug 只在首章有第 2 页时才会覆盖掉页码 0
const buildBook = (): Uint8Array<ArrayBuffer> => {
  const text = [
    '开篇说明。\n' + filler(2000),
    '第一章 风雪夜',
    filler(2000),
    '第二章 山路',
    filler(2000),
    '第三章 灯火',
    filler(2000),
  ].join('\n');
  return new TextEncoder().encode(text);
};

describe('transformTextToExpectedFormat 语法树', () => {
  it('自动识别的章节进入目录，titleIdPage 指向各章真实首页', () => {
    const tree = transformTextToExpectedFormat({
      content: buildBook(),
      container: fakeContainer,
      title: '测试书.txt',
    });

    // 目录项：序言 + 三章
    expect(tree.titleIdTitle).toHaveLength(4);
    expect(tree.titleIdTitle.slice(1)).toEqual(['第一章 风雪夜', '第二章 山路', '第三章 灯火']);

    // titleIdPage 必须与 pageTitleId 首次出现的位置一致，
    // 首章首页页码为 0，曾因 falsy 判断被误写成第 2 页（点目录第一项跳过开头）
    const realFirstPage: Record<number, number> = {};
    tree.pageTitleId.forEach((titleId, page) => {
      if (realFirstPage[titleId] === undefined) {
        realFirstPage[titleId] = page;
      }
    });
    expect(tree.titleIdPage[0]).toBe(0);
    for (const [titleId, page] of Object.entries(realFirstPage)) {
      expect(tree.titleIdPage[titleId]).toBe(page);
    }
  });

  it('传入预计算章节时跳过内部识别，直接采用', () => {
    const content = buildBook();
    const tree = transformTextToExpectedFormat({
      content,
      container: fakeContainer,
      title: '测试书.txt',
      chapters: [{ title: '自定义章节', start: 0, end: new TextDecoder().decode(content).length }],
    });
    expect(tree.titleIdTitle).toEqual(['自定义章节']);
  });

  it('无章节的文本整本作为一章', () => {
    const tree = transformTextToExpectedFormat({
      content: new TextEncoder().encode(filler(2000)),
      container: fakeContainer,
      title: '无格式.txt',
    });
    expect(tree.titleIdTitle).toEqual(['无格式.txt']);
    expect(tree.totalPage).toBeGreaterThan(0);
  });
});
