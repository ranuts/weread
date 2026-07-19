import { db } from '@/store/index';
import { CHAPTER_ALGO_VERSION, collectCandidates, detectChaptersDetailed } from '@/lib/chapter';
import type { Candidate, ChapterConfidence, DetectedChapter } from '@/lib/chapter';
import { detectChaptersWithModel } from '@/lib/chapter/modelDetect';
import { ChapterClassifier } from '@/lib/nlp';
import type { ModelProgress } from '@/lib/nlp';
import { detectLanguage, modelIdForLang } from '@/lib/nlp/detectLanguage';
import type { BookLang } from '@/lib/nlp/detectLanguage';
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
 * resolveBookChapters 刚算过的中间产物，供紧随其后的 `enhanceChaptersWithModel` 复用，
 * 免掉重复的 decode（大书上百万字符）+ 规则全文扫描。阅读场景一次一本，只留最近一本；
 * 换书或缓存命中（未重算）时 id 不匹配，enhance 自动回退到重算，语义安全。
 */
let resolveMemo: { id: string; text: string; lang: BookLang; candidates: Candidate[] } | null = null;

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
  const lang = detectLanguage(text);

  const captionChapters = extractCaptionTitleChapters(text);
  let record: Omit<BookChapters, 'algoVersion' | 'modifyTime'>;
  if (captionChapters.length > 0) {
    record = {
      id,
      chapters: captionChapters.map((item) => ({ title: item.title, start: item.start, end: item.end ?? text.length })),
      confidence: 'high',
      familyId: null,
      source: 'caption',
      lang,
    };
  } else {
    // 候选只算一次：既喂规则验证，又备给可能紧随的模型增强（union 用同一份规则候选）
    const candidates = collectCandidates(text);
    const detection = detectChaptersDetailed(text, candidates);
    record = {
      id,
      chapters: detection.chapters,
      confidence: detection.confidence,
      familyId: detection.familyId,
      source: 'rules',
      lang,
    };
    resolveMemo = { id, text, lang, candidates };
  }
  await saveChapters(record);
  return { ...record, algoVersion: CHAPTER_ALGO_VERSION, modifyTime: Date.now() };
};

/**
 * 是否值得对这本书做模型增强：规则置信度低（可能漏章）、且该语言有已部署的模型、
 * 且当前不是手动修正结果（手动优先）。UI 据此决定要不要显示「AI 增强」入口。
 */
export const canEnhanceWithModel = (record: BookChapters): boolean => {
  if (record.source === 'manual' || record.source === 'model') {
    return false;
  }
  if (record.confidence === 'high') {
    return false;
  }
  return record.lang !== undefined && modelIdForLang(record.lang) !== undefined;
};

// 语言模型客户端单例：切换语言时才重建，避免重复下载
let classifier: ChapterClassifier | null = null;
let loadedModelId: string | null = null;

export interface EnhanceOptions {
  onProgress?: (progress: ModelProgress) => void;
  threshold?: number;
}

/** 模型增强结果：record 为写入缓存的记录；improved 表示是否比规则找到了更多章节。 */
export interface EnhanceResult {
  record: BookChapters;
  improved: boolean;
}

/**
 * 用语言模型重新识别章节，**无论是否改善都写缓存（source: 'model'）**——这样
 * `canEnhanceWithModel` 之后判 false，重开该书不再自动/手动重跑推理（一次尝试即终态，
 * 避免每次打开都跑几十秒模型）。improved 为 false 时保留规则章节、供调用方给「未发现更多章节」反馈。
 * 该语言无模型时返回 null（调用方保持规则结果）。模型懒加载：首次调用才下载。
 * 复用 resolveBookChapters 的中间产物（text/lang/候选），免掉重复 decode + 规则扫描。
 */
export const enhanceChaptersWithModel = async (
  id: string,
  content: ArrayBuffer | Uint8Array<ArrayBuffer>,
  ruleChapters: DetectedChapter[],
  options: EnhanceOptions = {},
): Promise<EnhanceResult | null> => {
  // 紧随 resolveBookChapters 时命中 memo，直接复用其解码文本 / 语言 / 规则候选
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
  // 推理进度透传：worker 分批时以 status:'classifying' 上报 0-100，
  // 经 detectChaptersWithModel → classifyLines → 同一 onProgress 回到 UI（下载%→识别%）。
  const chapters = await detectChaptersWithModel(
    text,
    (inputs, onProgress) => activeClassifier.classifyLines(inputs, { onProgress }),
    { threshold: options.threshold, onProgress: options.onProgress, candidates: memo?.candidates },
  );
  // 模型没找到更多章节则保留规则结果（避免越增强越差），但仍缓存 source:'model' 标记「已尝试」
  const improved = chapters.length > ruleChapters.length;
  const record: Omit<BookChapters, 'algoVersion' | 'modifyTime'> = {
    id,
    chapters: improved ? chapters : ruleChapters,
    confidence: improved ? 'high' : 'none',
    familyId: null,
    source: 'model',
    lang,
  };
  await saveChapters(record);
  return { record: { ...record, algoVersion: CHAPTER_ALGO_VERSION, modifyTime: Date.now() }, improved };
};

/**
 * 保存用户手动编辑后的章节（source:'manual'）。manual 记录跨 algoVersion 永久有效、
 * `canEnhanceWithModel` 判 false——既是标注飞轮，也是规则/模型差结果的终态纠正出口。
 * 章节变了，清掉 resolveMemo 以免后续误用旧候选。
 */
export const saveManualChapters = async (
  id: string,
  chapters: DetectedChapter[],
  lang?: BookLang,
): Promise<void> => {
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
