/**
 * nlpWorker 与主线程之间的消息协议。
 * 双端共享此文件，保证请求/响应类型一致。
 */

/**
 * 章节标题分类模型。P3 训练完成后替换为自有的 mDeBERTa 微调模型 id；
 * 当前为链路验证用的占位模型（情感二分类，仅用于验证下载/缓存/推理管线）。
 */
export const PLACEHOLDER_MODEL_ID = 'Xenova/distilbert-base-uncased-finetuned-sst-2-english';

/** 推理后端，按优先级降级 */
export const DEVICE_PRIORITY = ['webgpu', 'wasm'] as const;

/**
 * 逐行推理阶段的进度 status（区别于 transformers.js 的下载进度）。
 * worker 在 classify 分批时以此 status 上报 0-100，主线程据此把 UI 从「下载」切到「识别」。
 */
export const CLASSIFY_STATUS = 'classifying';

export type NlpDevice = (typeof DEVICE_PRIORITY)[number];

/** 模型加载进度（transformers.js progress_callback 的窄化投影，可结构化克隆） */
export interface ModelProgress {
  status: string;
  /** 当前正在下载的文件名 */
  file?: string;
  /** 已下载字节数 */
  loaded?: number;
  /** 总字节数 */
  total?: number;
  /** 0-100 */
  progress?: number;
}

export interface LabelScore {
  label: string;
  score: number;
}

export interface LoadRequest {
  operationId: number;
  type: 'load';
  modelId: string;
  /** 量化精度，默认 q8 */
  dtype?: 'fp32' | 'fp16' | 'q8' | 'q4';
  /** 强制指定推理后端（调试或移动端策略用），缺省按 DEVICE_PRIORITY 降级 */
  device?: NlpDevice;
}

export interface ClassifyRequest {
  operationId: number;
  type: 'classify';
  lines: string[];
}

export type NlpRequest = LoadRequest | ClassifyRequest;

export interface ProgressResponse {
  operationId: number;
  type: 'progress';
  progress: ModelProgress;
}

export interface LoadedResponse {
  operationId: number;
  type: 'loaded';
  device: NlpDevice;
}

export interface ClassifyResponse {
  operationId: number;
  type: 'result';
  /** 与请求 lines 一一对应，每行是全部标签的得分 */
  scores: LabelScore[][];
}

export interface ErrorResponse {
  operationId: number;
  type: 'error';
  message: string;
}

export type NlpResponse = ProgressResponse | LoadedResponse | ClassifyResponse | ErrorResponse;
