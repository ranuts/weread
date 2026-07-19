import { describe, expect, it } from 'vitest';
import { buildPageOffsets, pageForOffset, segmentPage } from '@/lib/notes/anchor';
import type { BookNote } from '@/store/notes';

const note = (start: number, end: number, color: BookNote['color'] = 'yellow'): BookNote => ({
  id: `n:${start}:${end}`,
  bookId: 'b',
  start,
  end,
  text: '',
  color,
  createdAt: 0,
  updatedAt: 0,
});

describe('buildPageOffsets', () => {
  it('前缀和：每页起始 = 之前各页文本长度之和', () => {
    const offsets = buildPageOffsets([{ text: 'abc' }, { text: 'de' }, { text: 'fghi' }]);
    expect(offsets).toEqual([0, 3, 5]);
  });
  it('空列表返回空数组', () => {
    expect(buildPageOffsets([])).toEqual([]);
  });
});

describe('pageForOffset', () => {
  const offsets = [0, 3, 5, 9]; // 页长 3/2/4/…
  it('落在页区间内返回对应页', () => {
    expect(pageForOffset(offsets, 0)).toBe(0);
    expect(pageForOffset(offsets, 2)).toBe(0);
    expect(pageForOffset(offsets, 3)).toBe(1);
    expect(pageForOffset(offsets, 4)).toBe(1);
    expect(pageForOffset(offsets, 5)).toBe(2);
    expect(pageForOffset(offsets, 8)).toBe(2);
    expect(pageForOffset(offsets, 9)).toBe(3);
  });
  it('超出末页夹取到最后一页；空表返回 0', () => {
    expect(pageForOffset(offsets, 999)).toBe(3);
    expect(pageForOffset([], 5)).toBe(0);
  });
});

describe('segmentPage', () => {
  it('无划线 → 整页一个普通段', () => {
    const segs = segmentPage('hello world', 0, []);
    expect(segs).toEqual([{ text: 'hello world', note: null }]);
  });

  it('页中间一条划线 → 前段/高亮/后段', () => {
    // 页文本 "hello world"，全局起始 100，划线 [106,111)="world"
    const n = note(106, 111);
    const segs = segmentPage('hello world', 100, [n]);
    expect(segs.map((s) => s.text)).toEqual(['hello ', 'world']);
    expect(segs[0].note).toBeNull();
    expect(segs[1].note).toBe(n);
  });

  it('划线跨页边界 → 只高亮落在本页的部分', () => {
    // 页 [100,105) 文本 "abcde"，划线 [103,120) → 本页只 "de"
    const n = note(103, 120);
    const segs = segmentPage('abcde', 100, [n]);
    expect(segs.map((s) => s.text)).toEqual(['abc', 'de']);
    expect(segs[1].note).toBe(n);
  });

  it('完全不在本页的划线被忽略', () => {
    const segs = segmentPage('abcde', 100, [note(0, 50), note(200, 210)]);
    expect(segs).toEqual([{ text: 'abcde', note: null }]);
  });

  it('多条不重叠划线按顺序切段', () => {
    // "abcdefgh" @0，划线 [1,3) 和 [5,7)
    const n1 = note(1, 3);
    const n2 = note(5, 7);
    const segs = segmentPage('abcdefgh', 0, [n2, n1]); // 传入乱序，内部排序
    expect(segs.map((s) => s.text)).toEqual(['a', 'bc', 'de', 'fg', 'h']);
    expect(segs.map((s) => s.note)).toEqual([null, n1, null, n2, null]);
  });

  it('重叠划线：后者只接非重叠尾巴，切点不回退', () => {
    // [0,5) 与 [3,8) 重叠
    const n1 = note(0, 5);
    const n2 = note(3, 8);
    const segs = segmentPage('abcdefghij', 0, [n1, n2]);
    // 期望：[0,5)=abcde(n1)，[5,8)=fgh(n2)，剩 ij
    expect(segs.map((s) => s.text)).toEqual(['abcde', 'fgh', 'ij']);
    expect(segs[0].note).toBe(n1);
    expect(segs[1].note).toBe(n2);
    // 覆盖全文、无字符丢失/重复
    expect(segs.map((s) => s.text).join('')).toBe('abcdefghij');
  });
});
