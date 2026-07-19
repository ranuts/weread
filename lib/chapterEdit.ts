/**
 * 目录手动编辑桥。
 *
 * 目录（`components/Catalogue`）由语法树的 `titleIdTitle` 派生渲染，深埋在
 * book-detail → DetailOperate → Popover → DetailMenu → Catalogue 里，直接把编辑回调层层透传太重。
 * 改用「阅读页注册编辑上下文，目录组件调本模块函数」的方式解耦：编辑作用于底层 `chapters` 数组，
 * 再经阅读页真实容器 `transformTextToExpectedFormat` 重建树 + 存 source:'manual'。
 *
 * titleId ↔ chapters 映射：树在首章 start>0 时会前缀一个合成「前言」段（见 transformText），
 * 故 chapters 下标 = titleId − prefaceCount；preface 段（下标 <0）不可编辑。
 */

import { signal } from 'ranui/builder';
import { transformTextToExpectedFormat } from '@/lib/transformText';
import type { ChapterItem } from '@/lib/transformText';
import { getPageNum, setPageNum, setTextSyntaxTree } from '@/lib/subscribe';
import { saveManualChapters } from '@/store/chapters';
import type { BookLang } from '@/lib/nlp/detectLanguage';

interface ChapterEditContext {
  id: string;
  content: ArrayBuffer | Uint8Array<ArrayBuffer>;
  /** 分页测量容器（阅读页真实布局，clientW/H≥30） */
  container: HTMLElement;
  title: string;
  lang?: BookLang;
  /** 当前生效的章节（本模块会就地增删改，故须传入独立副本） */
  chapters: ChapterItem[];
}

let ctx: ChapterEditContext | null = null;

/** 可编辑章节数（>0 时目录才显示编辑入口），供目录组件反应式绑定 */
const [editableCount, setEditableCount] = signal(0);
export { editableCount };

/** 阅读页在章节就绪后注册；换书 / 增强后更新。chapters 须为独立副本（本模块会改）。 */
export const setChapterEditContext = (context: ChapterEditContext): void => {
  ctx = context;
  setEditableCount(context.chapters.length);
};

/** 阅读页卸载时清理，避免目录误用上一本的上下文 */
export const clearChapterEditContext = (): void => {
  ctx = null;
  setEditableCount(0);
};

/** 目录 titleId（含可能的 preface 段）→ chapters 下标；preface 段 / 越界返回 -1（不可编辑） */
const toChapterIndex = (titleId: number): number => {
  if (!ctx) return -1;
  const prefaceCount = ctx.chapters.length > 0 && ctx.chapters[0].start > 0 ? 1 : 0;
  const index = titleId - prefaceCount;
  return index >= 0 && index < ctx.chapters.length ? index : -1;
};

/** 用当前 chapters 重建语法树 + 夹紧页码 + 存 source:'manual' */
const rebuildAndPersist = async (): Promise<void> => {
  if (!ctx) return;
  const tree = transformTextToExpectedFormat({
    content: ctx.content,
    title: ctx.title,
    container: ctx.container,
    chapters: ctx.chapters,
  });
  setTextSyntaxTree(tree);
  if (getPageNum() > tree.totalPage) {
    setPageNum(Math.max(tree.totalPage, 0));
  }
  setEditableCount(ctx.chapters.length);
  await saveManualChapters(
    ctx.id,
    // end 均来自检测结果（number）；缺失时用大哨兵，slice 会夹到文本末尾
    ctx.chapters.map((c) => ({ title: c.title, start: c.start, end: c.end ?? Number.MAX_SAFE_INTEGER })),
    ctx.lang,
  );
};

/** 重命名某章（仅改标题，不动偏移/分页） */
export const renameChapter = (titleId: number, rawTitle: string): void => {
  const index = toChapterIndex(titleId);
  const title = rawTitle.trim();
  if (index < 0 || !ctx || !title || ctx.chapters[index].title === title) return;
  ctx.chapters[index].title = title;
  void rebuildAndPersist();
};

/** 删除某章：前一章 end 吸收被删章范围（正文并入上一章），再从 chapters 移除 */
export const deleteChapter = (titleId: number): void => {
  const index = toChapterIndex(titleId);
  if (index < 0 || !ctx) return;
  const removed = ctx.chapters[index];
  if (index > 0) {
    ctx.chapters[index - 1].end = removed.end;
  }
  ctx.chapters.splice(index, 1);
  void rebuildAndPersist();
};
