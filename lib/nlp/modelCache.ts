/**
 * 语言模型的「后台预取 + 缓存探测」。
 *
 * 思路：应用的 service worker（public/sw.js）对所有同源 GET 200 做 cache-first，
 * 所以只要把模型文件 fetch 一次，SW 就会存进 `ranuts_weread` 缓存，之后 transformers.js
 * 请求同一 URL 会被 SW 命中、离线可用、无需二次下载。本模块只负责「把字节拉进缓存」，
 * 不初始化模型（那是 nlpWorker 的事，重、占内存）。
 *
 * 预取受网络状况与用户开关约束：省流量 / 2G 慢网 / 显式关闭时不预取，避免偷跑大流量。
 */

import { base } from '@/router';
import { modelIdForLang } from './detectLanguage';
import type { BookLang } from './detectLanguage';

/** 关闭预取的 localStorage 开关（设任意值即关闭） */
export const MODEL_PREFETCH_OPT_OUT = 'weread_disable_model_prefetch';

const MODEL_BASE = `${base}/models/`;

/**
 * transformers.js 以 dtype:'q8' 加载时会请求的文件集合。预取这些即可让后续真实加载全命中缓存。
 * onnx 权重是大头（zh 99MB / en 65MB），其余是 KB 级配置/分词器。
 */
const MODEL_FILES = [
  'config.json',
  'tokenizer.json',
  'tokenizer_config.json',
  'special_tokens_map.json',
  'onnx/model_quantized.onnx',
] as const;

const fileUrl = (modelId: string, file: string): string => `${MODEL_BASE}${modelId}/${file}`;

/** CacheStorage 是否可用（非安全上下文 / 老浏览器可能没有） */
const hasCaches = (): boolean => typeof caches !== 'undefined';

/** 某模型是否已在缓存里（以 onnx 权重是否命中为准——它最大、最后下载完成） */
export const isModelCached = async (modelId: string): Promise<boolean> => {
  if (!hasCaches()) return false;
  try {
    const hit = await caches.match(fileUrl(modelId, 'onnx/model_quantized.onnx'));
    return Boolean(hit);
  } catch {
    return false;
  }
};

/** 网络与用户开关是否允许「主动下载大模型」（省流量/慢网/关闭时不允许） */
export const networkAllowsDownload = (): boolean => {
  try {
    if (localStorage.getItem(MODEL_PREFETCH_OPT_OUT)) return false;
  } catch {
    // localStorage 不可用时不阻断
  }
  const conn = (navigator as unknown as { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  if (conn?.saveData) return false;
  if (conn?.effectiveType === 'slow-2g' || conn?.effectiveType === '2g') return false;
  return true;
};

/** 拉取单个文件进 SW 缓存；已缓存则跳过，失败静默（预取不该影响主流程） */
const prefetchFile = async (url: string): Promise<void> => {
  try {
    if (hasCaches() && (await caches.match(url))) return;
    await fetch(url, { cache: 'force-cache' });
  } catch {
    // 忽略：预取失败只是让后续加载走一次真实下载
  }
};

/** 预取一个模型的全部文件（串行，避免占满带宽拖慢正在阅读的页面） */
export const prefetchModel = async (modelId: string): Promise<void> => {
  for (const file of MODEL_FILES) {
    await prefetchFile(fileUrl(modelId, file));
  }
};

/**
 * 在浏览器空闲时预取指定语言的模型（去重、跳过无模型的语言）。
 * 受 networkAllowsDownload 约束。非阻塞：调用后立即返回。
 */
export const prefetchModelsForLangs = (langs: Iterable<BookLang>): void => {
  if (!networkAllowsDownload()) return;
  const ids = new Set<string>();
  for (const lang of langs) {
    const id = modelIdForLang(lang);
    if (id) ids.add(id);
  }
  if (ids.size === 0) return;

  const run = (): void => {
    void (async (): Promise<void> => {
      for (const id of ids) {
        if (await isModelCached(id)) continue;
        await prefetchModel(id);
      }
    })();
  };

  const idle = (window as unknown as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => void })
    .requestIdleCallback;
  if (idle) {
    idle(run, { timeout: 8000 });
  } else {
    setTimeout(run, 2500);
  }
};

/** 浏览器 UI 语言 → 书籍语言桶（用于「无书架语言信息时」的默认预取目标） */
export const uiLang = (): BookLang => {
  const lang = (navigator.language || 'en').toLowerCase();
  if (lang.startsWith('zh')) return 'zh';
  if (lang.startsWith('en')) return 'en';
  return 'other';
};

/**
 * 打开一本 confidence='none' 的书时，是否应「自动」触发模型增强：
 * - 该语言有模型；
 * - 模型已缓存 → 直接自动（无额外流量）；
 * - 未缓存但网络允许下载（非省流量/慢网/未关闭）→ 也自动（带下载进度）；
 * - 未缓存且网络受限 → 不自动，保留手动「AI 增强」按钮。
 */
export const canAutoEnhance = async (lang: BookLang | undefined): Promise<boolean> => {
  if (!lang) return false;
  const modelId = modelIdForLang(lang);
  if (!modelId) return false;
  if (await isModelCached(modelId)) return true;
  return networkAllowsDownload();
};
