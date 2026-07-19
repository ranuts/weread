import { db } from '@/store/index';

export const STORE_NAME_BOOKS_NOTES_KEY = 'books_notes';

/**
 * 划线 / 高亮 / 想法。一本书多条，key 为笔记 id，`bookId` 字段供按书过滤
 * （WebDB 只暴露整表游标读，没有索引查询，按书过滤在内存里做——个人书笔记量小，足够）。
 *
 * **锚点用「可见文本」的全局字符偏移** `[start, end)`：即所有页 `pageText[].text` 顺序拼起来的坐标系。
 * 该坐标与分页解耦（换字号/行距只是重新切页，拼接后的可见文本长度不变），故换阅读设置后划线不丢位。
 * 另存选中原文 `text` 兜底展示（笔记面板、锚点失配时的回退）。
 */
export type HighlightColor = 'yellow' | 'green' | 'blue' | 'pink';

export const HIGHLIGHT_COLORS: HighlightColor[] = ['yellow', 'green', 'blue', 'pink'];

export const DEFAULT_HIGHLIGHT_COLOR: HighlightColor = 'yellow';

export interface BookNote {
  /** 笔记 id：`${bookId}:${start}:${createdAt}`，全局唯一 */
  id: string;
  bookId: string;
  /** 可见文本全局起始偏移（含） */
  start: number;
  /** 可见文本全局结束偏移（不含） */
  end: number;
  /** 选中原文（面板展示 + 回退） */
  text: string;
  /** 用户想法（可选） */
  thought?: string;
  color: HighlightColor;
  /** 所属章节标题（面板分组用，快照，可选） */
  chapterTitle?: string;
  createdAt: number;
  updatedAt: number;
}

/** 生成一条笔记的 id（同一起点同一时刻不会重复）。 */
export const makeNoteId = (bookId: string, start: number, createdAt: number): string =>
  `${bookId}:${start}:${createdAt}`;

/** 读某本书的全部笔记，按起始偏移升序（渲染/面板都要有序）。未就绪返回空数组，不阻塞阅读。 */
export const getNotesByBook = async (bookId: string): Promise<BookNote[]> => {
  try {
    const res = await db.readByCursor<BookNote>({ storeName: STORE_NAME_BOOKS_NOTES_KEY });
    return (res.data ?? []).filter((n) => n?.bookId === bookId).sort((a, b) => a.start - b.start);
  } catch {
    return [];
  }
};

/** 新增/更新一条笔记，失败静默（丢笔记不影响阅读）。 */
export const saveNote = async (note: BookNote): Promise<void> => {
  try {
    await db.update({ storeName: STORE_NAME_BOOKS_NOTES_KEY, data: { ...note, updatedAt: Date.now() } });
  } catch {
    // 忽略
  }
};

/** 删除一条笔记。 */
export const deleteNote = async (id: string): Promise<void> => {
  try {
    await db.delete({ storeName: STORE_NAME_BOOKS_NOTES_KEY, key: id });
  } catch {
    // 忽略
  }
};

/** 删书时清掉该书全部笔记（级联）。 */
export const deleteNotesByBook = async (bookId: string): Promise<void> => {
  try {
    const res = await db.readByCursor<BookNote>({ storeName: STORE_NAME_BOOKS_NOTES_KEY });
    const ids = (res.data ?? []).filter((n) => n?.bookId === bookId).map((n) => n.id);
    await Promise.all(ids.map((id) => db.delete({ storeName: STORE_NAME_BOOKS_NOTES_KEY, key: id })));
  } catch {
    // 忽略
  }
};
