import { PLACEHOLDER_MODEL_ID } from './protocol';
import type {
  ClassifyResponse,
  LabelScore,
  LoadRequest,
  LoadedResponse,
  ModelProgress,
  NlpDevice,
  NlpRequest,
  NlpResponse,
} from './protocol';
import { toTitleScores } from './score';

/** 微调模型的正类标签，P3 训练脚本需与此保持一致 */
// 自训模型的正类标签为 'title'（config.json id2label），与 ml/train/train.py LABELS 一致
export const DEFAULT_POSITIVE_LABEL = 'title';

export interface LoadModelOptions {
  modelId?: string;
  dtype?: LoadRequest['dtype'];
  /** 强制指定推理后端，缺省 WebGPU 优先、WASM 兜底 */
  device?: NlpDevice;
  onProgress?: (progress: ModelProgress) => void;
}

export interface ClassifyOptions {
  /** 视为「是标题」的标签名 */
  positiveLabel?: string;
}

interface PendingOperation {
  resolve: (response: NlpResponse) => void;
  reject: (error: Error) => void;
  onProgress?: (progress: ModelProgress) => void;
}

/**
 * nlpWorker 的主线程封装：模型懒加载（首次 load 才创建 worker 并下载模型，
 * 之后走浏览器缓存离线可用），批量行分类返回「是标题」概率。
 * 用法：
 *   const classifier = new ChapterClassifier();
 *   await classifier.load({ onProgress });
 *   const scores = await classifier.classifyLines(lines);
 */
export class ChapterClassifier {
  private worker: Worker | null = null;
  private nextOperationId = 1;
  private pending = new Map<number, PendingOperation>();
  private device: NlpDevice | null = null;
  private readonly createWorker: () => Worker;

  constructor(createWorker?: () => Worker) {
    this.createWorker =
      createWorker ??
      ((): Worker => new Worker(new URL('../../workers/nlpWorker.ts', import.meta.url), { type: 'module' }));
  }

  /** 当前推理后端，未加载时为 null */
  get activeDevice(): NlpDevice | null {
    return this.device;
  }

  async load(options: LoadModelOptions = {}): Promise<NlpDevice> {
    const response = await this.send(
      {
        type: 'load',
        modelId: options.modelId ?? PLACEHOLDER_MODEL_ID,
        dtype: options.dtype,
        device: options.device,
      },
      options.onProgress,
    );
    this.device = (response as LoadedResponse).device;
    return this.device;
  }

  /** 逐行返回「是标题」概率，需先 load */
  async classifyLines(lines: string[], options: ClassifyOptions = {}): Promise<number[]> {
    const scores = await this.classifyLinesRaw(lines);
    return toTitleScores(scores, options.positiveLabel ?? DEFAULT_POSITIVE_LABEL);
  }

  /** 逐行返回全部标签得分，调试与评估用 */
  async classifyLinesRaw(lines: string[]): Promise<LabelScore[][]> {
    const response = await this.send({ type: 'classify', lines });
    return (response as ClassifyResponse).scores;
  }

  /** 终止 worker 并拒绝所有在途请求；再次 load 会重建 */
  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
    this.device = null;
    this.rejectAll(new Error('ChapterClassifier disposed'));
  }

  private getWorker(): Worker {
    if (!this.worker) {
      this.worker = this.createWorker();
      this.worker.onmessage = (event: MessageEvent<NlpResponse>) => {
        this.handleMessage(event.data);
      };
      this.worker.onerror = (event: ErrorEvent) => {
        this.rejectAll(new Error(event.message || 'nlpWorker crashed'));
      };
    }
    return this.worker;
  }

  private send(
    request: Omit<LoadRequest, 'operationId'> | { type: 'classify'; lines: string[] },
    onProgress?: (progress: ModelProgress) => void,
  ): Promise<NlpResponse> {
    const operationId = this.nextOperationId++;
    return new Promise<NlpResponse>((resolve, reject) => {
      this.pending.set(operationId, { resolve, reject, onProgress });
      this.getWorker().postMessage({ ...request, operationId } as NlpRequest);
    });
  }

  private handleMessage(response: NlpResponse): void {
    const operation = this.pending.get(response.operationId);
    if (!operation) {
      return;
    }
    if (response.type === 'progress') {
      operation.onProgress?.(response.progress);
      return;
    }
    this.pending.delete(response.operationId);
    if (response.type === 'error') {
      operation.reject(new Error(response.message));
    } else {
      operation.resolve(response);
    }
  }

  private rejectAll(error: Error): void {
    for (const operation of this.pending.values()) {
      operation.reject(error);
    }
    this.pending.clear();
  }
}

export { PLACEHOLDER_MODEL_ID } from './protocol';
export type { LabelScore, ModelProgress, NlpDevice } from './protocol';
export { toTitleScores, normalizeClassifierOutput } from './score';
