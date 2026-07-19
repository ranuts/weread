import { db } from '@/store/index';
import { CHAPTER_ALGO_VERSION } from '@/lib/chapter';
import type { ChapterConfidence, DetectedChapter } from '@/lib/chapter';
import { detectChaptersWithModel } from '@/lib/chapter/modelDetect';
import { ChapterClassifier } from '@/lib/nlp';
import type { ModelProgress } from '@/lib/nlp';
import { detectLanguage, modelIdForLang } from '@/lib/nlp/detectLanguage';
import type { BookLang } from '@/lib/nlp/detectLanguage';
import { arrayBufferToString, extractCaptionTitleChapters } from '@/lib/transformText';

export const STORE_NAME_BOOKS_CHAPTERS_KEY = 'books_chapters';

/**
 * 章节结果来源：
 * - `caption`：文本内显式 `<caption-title>` 标注（权威，非规则猜测）
 * - `model`：逐行模型识别（唯一的自动识别路径）
 * - `manual`：用户手动修正
 * - `pending`：尚未识别（等模型跑），不写缓存
 * 说明：规则模式匹配（第 X 章/Chapter N）已弃用——真实语料只 54% 覆盖且打地鼠，见
 * docs/chapter-detection-journey.md 经验 3。规则模块文件保留但不再参与识别。
 */
export type ChapterSource = 'caption' | 'model' | 'manual' | 'pending';

/** 该语言是否有可用的章节识别模型（'other' 等无模型语言无法自动识别）。 */
export const hasModelForLang = (lang: BookLang | undefined): boolean =>
  lang !== undefined && modelIdForLang(lang) !== undefined;

export interface BookChapters {
  /** 书籍 id（与 books_info 同 key） */
  id: string;
  chapters: DetectedChapter[];
  confidence: ChapterConfidence;
  familyId: string | null;
  source: ChapterSource;
  /** 书籍主语言，决定用哪个语言模型增强；旧缓存可能无此字段 */
  lang?: BookLang;
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
    // 任何已缓存结果（含旧的 source:'rules'）都直接复用——秒出目录、不重下 103MB 模型、不卡顿。
    // 纯模型只作用于「无缓存的新书」；已缓存旧书如需用模型重识别，清其章节缓存后重开即可。
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
 * resolveBookChapters 刚算过的中间产物（解码文本 + 语言），供紧随其后的 `detectChaptersByModel`
 * 复用，免掉重复 decode（大书上百万字符）。阅读场景一次一本，只留最近一本；
 * 换书或缓存命中（未重算）时 id 不匹配，识别自动回退到重新 decode，语义安全。
 */
let resolveMemo: { id: string; text: string; lang: BookLang } | null = null;

/**
 * 解析一本书的章节（**模型优先，不跑规则**）：
 * 1. 缓存命中（model/manual/caption）直接返回——开书秒出。
 * 2. 文本内显式 `<caption-title>` 标注（权威）→ 直接成目录并缓存。
 * 3. 否则返回 `source:'pending'` 空章节（整本一章，立即可读），**不写缓存**；
 *    调用方随后跑模型（`detectChaptersByModel`）并缓存 `source:'model'`。
 * 返回的 chapters 偏移基于「解码后换行归一化为 \n」的文本，与 transformText 内部一致。
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
  const lang = detectLanguage(text);

  const captionChapters = extractCaptionTitleChapters(text);
  if (captionChapters.length > 0) {
    const record: Omit<BookChapters, 'algoVersion' | 'modifyTime'> = {
      id,
      chapters: captionChapters.map((item) => ({ title: item.title, start: item.start, end: item.end ?? text.length })),
      confidence: 'high',
      familyId: null,
      source: 'caption',
      lang,
    };
    await saveChapters(record);
    return { ...record, algoVersion: CHAPTER_ALGO_VERSION, modifyTime: Date.now() };
  }

  // 交给模型识别：先出空章节（整本一章）让 reader 立即可读，不缓存。memo 供紧随的模型识别复用解码文本/语言。
  resolveMemo = { id, text, lang };
  return {
    id,
    chapters: [],
    confidence: 'none',
    familyId: null,
    source: 'pending',
    lang,
    algoVersion: CHAPTER_ALGO_VERSION,
    modifyTime: Date.now(),
  };
};

// 语言模型客户端单例：切换语言时才重建，避免重复下载
let classifier: ChapterClassifier | null = null;
let loadedModelId: string | null = null;

export interface DetectOptions {
  onProgress?: (progress: ModelProgress) => void;
  threshold?: number;
}

/**
 * **纯模型**章节识别（唯一自动识别路径）。逐行模型分类 → 过阈值的行即章节 → 缓存 `source:'model'`
 * （无论找到几章都写缓存，重开直接用、不再跑推理）。该语言无模型时返回 null（无法识别，保持整本一章）。
 * 模型懒加载：首次调用才下载（之后经 SW / 浏览器缓存永久命中）。复用 resolveBookChapters 的解码文本/语言。
 */
export const detectChaptersByModel = async (
  id: string,
  content: ArrayBuffer | Uint8Array<ArrayBuffer>,
  options: DetectOptions = {},
): Promise<BookChapters | null> => {
  const memo = resolveMemo?.id === id ? resolveMemo : null;
  const text = memo?.text ?? (arrayBufferToString(content).replace(/(?:\r\n|\r|\n)+/g, '\n') || '');
  const lang = memo?.lang ?? detectLanguage(text);
  const modelId = modelIdForLang(lang);
  if (!modelId) {
    return null;
  }
  if (!classifier || loadedModelId !== modelId) {
    classifier?.dispose();
    classifier = new ChapterClassifier();
    await classifier.load({ modelId, dtype: 'q8', onProgress: options.onProgress });
    loadedModelId = modelId;
  }
  const activeClassifier = classifier;
  // 推理进度透传：worker 分批以 status:'classifying' 上报 0-100 → 同一 onProgress 回 UI（下载%→识别%）。
  const chapters = await detectChaptersWithModel(
    text,
    (inputs, onProgress) => activeClassifier.classifyLines(inputs, { onProgress }),
    { threshold: options.threshold, onProgress: options.onProgress },
  );
  const record: Omit<BookChapters, 'algoVersion' | 'modifyTime'> = {
    id,
    chapters,
    confidence: chapters.length > 0 ? 'high' : 'none',
    familyId: null,
    source: 'model',
    lang,
  };
  await saveChapters(record);
  return { ...record, algoVersion: CHAPTER_ALGO_VERSION, modifyTime: Date.now() };
};

/**
 * 保存用户手动编辑后的章节（source:'manual'）。manual 记录跨 algoVersion 永久有效（缓存命中即终态、
 * 不再跑模型）——既是标注飞轮，也是模型差结果的终态纠正出口。
 * 章节变了，清掉 resolveMemo 以免后续误用旧文本。
 */
export const saveManualChapters = async (id: string, chapters: DetectedChapter[], lang?: BookLang): Promise<void> => {
  resolveMemo = null;
  await saveChapters({ id, chapters, confidence: 'high', familyId: null, source: 'manual', lang });
};

/** 删除某本书的章节缓存（删书或手动重置时用） */
export const deleteChapters = async (id: string): Promise<void> => {
  try {
    await db.delete({ storeName: STORE_NAME_BOOKS_CHAPTERS_KEY, key: id });
  } catch {
    // 忽略
  }
};
