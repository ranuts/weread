import type { BookNote } from '@/store/notes';

/**
 * 划线锚点的坐标换算（纯函数，无 DOM，易测）。
 *
 * 「可见文本」坐标系 = 所有页 `pageText[].text` 顺序拼接。某页的全局起始偏移 = 其之前所有页文本长度之和。
 * 划线锚点存的是这个坐标系里的 `[start, end)`，与分页解耦——换字号/行距重新切页后，拼接文本不变，锚点仍有效。
 */

/** 每页在可见文本坐标系里的全局起始偏移（前缀和）。offsets[i] = 前 i 页文本长度之和。 */
export const buildPageOffsets = (pageText: { text: string }[]): number[] => {
  const offsets: number[] = new Array(pageText.length);
  let acc = 0;
  for (let i = 0; i < pageText.length; i++) {
    offsets[i] = acc;
    acc += pageText[i]?.text.length ?? 0;
  }
  return offsets;
};

/** 找出全局偏移落在哪一页（笔记面板跳页用）：最后一个 `offsets[i] <= offset`，越界夹取到 [0, len-1]。 */
export const pageForOffset = (offsets: number[], offset: number): number => {
  if (offsets.length === 0) return 0;
  let lo = 0;
  let hi = offsets.length - 1;
  let ans = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (offsets[mid] <= offset) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
};

export interface PageSegment {
  text: string;
  /** 命中的笔记（该段高亮）；null = 普通文本段。 */
  note: BookNote | null;
}

/**
 * 把一页可见文本按落在其区间内的笔记切成「普通段 / 高亮段」序列，供分段渲染。
 * `pageStart` = 该页全局起始偏移，`pageStr` = 该页文本。笔记按起点排序；重叠时后者只接非重叠尾巴，
 * 保证切点单调递增、无负长度（不做合并，个人划线极少重叠）。
 */
export const segmentPage = (pageStr: string, pageStart: number, notes: BookNote[]): PageSegment[] => {
  const pageEnd = pageStart + pageStr.length;
  const ranges = notes
    .map((n) => ({ note: n, s: Math.max(n.start, pageStart) - pageStart, e: Math.min(n.end, pageEnd) - pageStart }))
    .filter((r) => r.e > r.s)
    .sort((a, b) => a.s - b.s || a.e - b.e);

  const segs: PageSegment[] = [];
  let cursor = 0;
  for (const r of ranges) {
    let s = r.s;
    if (s < cursor) {
      if (r.e <= cursor) continue; // 完全被前一段吞没
      s = cursor; // 只接非重叠尾巴
    }
    if (s > cursor) segs.push({ text: pageStr.slice(cursor, s), note: null });
    segs.push({ text: pageStr.slice(s, r.e), note: r.note });
    cursor = r.e;
  }
  if (cursor < pageStr.length) segs.push({ text: pageStr.slice(cursor), note: null });
  if (segs.length === 0) segs.push({ text: pageStr, note: null });
  return segs;
};
