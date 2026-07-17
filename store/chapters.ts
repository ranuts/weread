import { db } from '@/store/index';
import { CHAPTER_ALGO_VERSION, detectChaptersDetailed } from '@/lib/chapter';
import type { ChapterConfidence, DetectedChapter } from '@/lib/chapter';
import { arrayBufferToString, extractCaptionTitleChapters } from '@/lib/transformText';

export const STORE_NAME_BOOKS_CHAPTERS_KEY = 'books_chapters';

/** 章节结果来源：caption 标注 / 规则识别 / 模型增强 / 用户手动修正 */
export type ChapterSource = 'caption' | 'rules' | 'model' | 'manual';

export interface BookChapters {
  /** 书籍 id（与 books_info 同 key） */
  id: string;
  chapters: DetectedChapter[];
  confidence: ChapterConfidence;
  familyId: string | null;
  source: ChapterSource;
  /** 生成结果时的规则算法版本，用于算法升级后失效重算 */
  algoVersion: number;
  modifyTime: number;
}

/**
 * 读取缓存的章节结果。手动修正的结果永远有效；
 * 规则/模型产出的结果在算法版本升级后视为未命中，触发重算。
 * 数据库未就绪或旧库缺 store 时按未命中处理，不阻塞阅读流程。
 */
export const getCachedChapters = async (id: string): Promise<BookChapters | null> => {
  try {
    const result = await db.readByKey<BookChapters | undefined>({ storeName: STORE_NAME_BOOKS_CHAPTERS_KEY, key: id });
    const record = result.data;
    if (!record || !Array.isArray(record.chapters)) {
      return null;
    }
    if (record.source !== 'manual' && record.algoVersion !== CHAPTER_ALGO_VERSION) {
      return null;
    }
    return record;
  } catch {
    return null;
  }
};

/** 写入章节结果缓存，失败静默（缓存缺失只影响下次打开的解析耗时） */
export const saveChapters = async (record: Omit<BookChapters, 'algoVersion' | 'modifyTime'>): Promise<void> => {
  try {
    await db.update({
      storeName: STORE_NAME_BOOKS_CHAPTERS_KEY,
      data: { ...record, algoVersion: CHAPTER_ALGO_VERSION, modifyTime: Date.now() },
    });
  } catch {
    // 忽略：旧版本库缺 store 或配额不足时降级为每次现算
  }
};

/**
 * 解析一本书的章节：缓存命中直接返回；否则依次尝试
 * <caption-title> 标注 → 规则识别，并把结果写入缓存。
 * 返回的 chapters 偏移基于「解码后换行归一化为 \n」的文本，
 * 与 transformTextToExpectedFormat 内部使用的文本一致。
 */
export const resolveBookChapters = async (
  id: string,
  content: ArrayBuffer | Uint8Array<ArrayBuffer>,
): Promise<BookChapters> => {
  const cached = await getCachedChapters(id);
  if (cached) {
    return cached;
  }
  const text = arrayBufferToString(content).replace(/(?:\r\n|\r|\n)+/g, '\n') || '';

  const captionChapters = extractCaptionTitleChapters(text);
  let record: Omit<BookChapters, 'algoVersion' | 'modifyTime'>;
  if (captionChapters.length > 0) {
    record = {
      id,
      chapters: captionChapters.map((item) => ({ title: item.title, start: item.start, end: item.end ?? text.length })),
      confidence: 'high',
      familyId: null,
      source: 'caption',
    };
  } else {
    const detection = detectChaptersDetailed(text);
    record = {
      id,
      chapters: detection.chapters,
      confidence: detection.confidence,
      familyId: detection.familyId,
      source: 'rules',
    };
  }
  await saveChapters(record);
  return { ...record, algoVersion: CHAPTER_ALGO_VERSION, modifyTime: Date.now() };
};

/** 删除某本书的章节缓存（删书或手动重置时用） */
export const deleteChapters = async (id: string): Promise<void> => {
  try {
    await db.delete({ storeName: STORE_NAME_BOOKS_CHAPTERS_KEY, key: id });
  } catch {
    // 忽略
  }
};
