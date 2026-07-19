import { db } from '@/store/index';

export const STORE_NAME_BOOKS_PROGRESS_KEY = 'books_progress';

/**
 * 阅读进度（续读）。单独一个 store，避免每次翻页重写 books_info 里的整本 content 大 blob。
 * 存页码 + 当时总页数：同一分页下精确续读；换字号/章节重排导致总页变了时按比例缩放定位。
 */
export interface ReadingProgress {
  id: string;
  /** 当前页码（0-based，与阅读态 pageNum 一致） */
  page: number;
  /** 记录时的总页下标（tree.totalPage）；实际页数 = totalPage + 1 */
  totalPage: number;
  /** 0-100 整数，书架展示用 */
  percent: number;
  updatedAt: number;
}

/** 由页码/总页算阅读百分比（0-100）。totalPage 是最大页下标。 */
export const toPercent = (page: number, totalPage: number): number => {
  if (totalPage <= 0) return page > 0 ? 100 : 0;
  return Math.max(0, Math.min(100, Math.round((page / totalPage) * 100)));
};

/** 读单本进度，未就绪/未命中返回 null，不阻塞阅读流程。 */
export const getProgress = async (id: string): Promise<ReadingProgress | null> => {
  try {
    const res = await db.readByKey<ReadingProgress | undefined>({ storeName: STORE_NAME_BOOKS_PROGRESS_KEY, key: id });
    return res.data ?? null;
  } catch {
    return null;
  }
};

/** 写进度，失败静默（丢进度只影响下次续读，不影响阅读）。 */
export const saveProgress = async (id: string, page: number, totalPage: number): Promise<void> => {
  try {
    await db.update({
      storeName: STORE_NAME_BOOKS_PROGRESS_KEY,
      data: {
        id,
        page,
        totalPage,
        percent: toPercent(page, totalPage),
        updatedAt: Date.now(),
      } satisfies ReadingProgress,
    });
  } catch {
    // 忽略
  }
};

/** 读全部进度，映射成 id → 进度（书架一次性拉）。 */
export const getAllProgress = async (): Promise<Record<string, ReadingProgress>> => {
  try {
    const res = await db.readByCursor<ReadingProgress>({ storeName: STORE_NAME_BOOKS_PROGRESS_KEY });
    const map: Record<string, ReadingProgress> = {};
    (res.data ?? []).forEach((p) => {
      if (p?.id) map[p.id] = p;
    });
    return map;
  } catch {
    return {};
  }
};

/** 删书时清进度。 */
export const deleteProgress = async (id: string): Promise<void> => {
  try {
    await db.delete({ storeName: STORE_NAME_BOOKS_PROGRESS_KEY, key: id });
  } catch {
    // 忽略
  }
};

/** 把已保存的页码映射到当前分页：同分页精确，否则按比例缩放并夹取到有效范围。 */
export const restorePage = (saved: ReadingProgress, currentTotalPage: number): number => {
  if (saved.page <= 0) return 0;
  const mapped =
    saved.totalPage === currentTotalPage
      ? saved.page
      : Math.round((saved.page / (saved.totalPage || 1)) * currentTotalPage);
  return Math.max(0, Math.min(mapped, currentTotalPage));
};
