import { describe, expect, it, vi } from 'vitest';
import { ChapterClassifier } from '../index';
import type { NlpRequest, NlpResponse } from '../protocol';
import { normalizeClassifierOutput, toTitleScores } from '../score';

describe('score 映射', () => {
  it('按正类标签取概率，缺失标签按 0 处理', () => {
    const scores = [
      [
        { label: 'LABEL_0', score: 0.3 },
        { label: 'LABEL_1', score: 0.7 },
      ],
      [{ label: 'LABEL_0', score: 0.9 }],
    ];
    expect(toTitleScores(scores, 'LABEL_1')).toEqual([0.7, 0]);
  });

  it('归一化分类器输出：单行扁平输出包成一行', () => {
    const flat = [
      { label: 'LABEL_0', score: 0.2 },
      { label: 'LABEL_1', score: 0.8 },
    ];
    expect(normalizeClassifierOutput(flat, 1)).toEqual([flat]);
  });

  it('归一化分类器输出：多行时逐行包装非数组项', () => {
    const mixed = [{ label: 'LABEL_1', score: 0.6 }, [{ label: 'LABEL_1', score: 0.4 }]];
    expect(normalizeClassifierOutput(mixed, 2)).toEqual([
      [{ label: 'LABEL_1', score: 0.6 }],
      [{ label: 'LABEL_1', score: 0.4 }],
    ]);
  });

  it('归一化分类器输出：非数组输入返回空', () => {
    expect(normalizeClassifierOutput(null, 3)).toEqual([]);
  });
});

/** 模拟 nlpWorker：记录请求，由测试手动回消息 */
class FakeWorker {
  onmessage: ((event: MessageEvent<NlpResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  sent: NlpRequest[] = [];
  terminated = false;

  postMessage(message: NlpRequest): void {
    this.sent.push(message);
  }

  terminate(): void {
    this.terminated = true;
  }

  emit(response: NlpResponse): void {
    this.onmessage?.({ data: response } as MessageEvent<NlpResponse>);
  }
}

const createClassifier = (): { classifier: ChapterClassifier; worker: FakeWorker } => {
  const worker = new FakeWorker();
  const classifier = new ChapterClassifier(() => worker as unknown as Worker);
  return { classifier, worker };
};

describe('ChapterClassifier 协议', () => {
  it('load：转发进度回调并返回后端类型', async () => {
    const { classifier, worker } = createClassifier();
    const onProgress = vi.fn();
    const loadPromise = classifier.load({ modelId: 'test/model', onProgress });

    const { operationId } = worker.sent[0];
    worker.emit({ operationId, type: 'progress', progress: { status: 'progress', file: 'model.onnx', progress: 50 } });
    worker.emit({ operationId, type: 'loaded', device: 'wasm' });

    await expect(loadPromise).resolves.toBe('wasm');
    expect(onProgress).toHaveBeenCalledWith({ status: 'progress', file: 'model.onnx', progress: 50 });
    expect(classifier.activeDevice).toBe('wasm');
    expect(worker.sent[0]).toMatchObject({ type: 'load', modelId: 'test/model' });
  });

  it('classifyLines：按 title 标签映射为标题概率', async () => {
    const { classifier, worker } = createClassifier();
    const promise = classifier.classifyLines(['第一章 起点', '正文内容']);

    const { operationId } = worker.sent[0];
    worker.emit({
      operationId,
      type: 'result',
      scores: [
        [
          { label: 'not_title', score: 0.1 },
          { label: 'title', score: 0.9 },
        ],
        [
          { label: 'not_title', score: 0.8 },
          { label: 'title', score: 0.2 },
        ],
      ],
    });

    await expect(promise).resolves.toEqual([0.9, 0.2]);
  });

  it('worker 返回错误时对应请求被拒绝', async () => {
    const { classifier, worker } = createClassifier();
    const promise = classifier.classifyLines(['line']);

    const { operationId } = worker.sent[0];
    worker.emit({ operationId, type: 'error', message: 'Model not loaded, send a load request first' });

    await expect(promise).rejects.toThrow('Model not loaded');
  });

  it('dispose：终止 worker 并拒绝在途请求', async () => {
    const { classifier, worker } = createClassifier();
    const promise = classifier.load();
    classifier.dispose();

    await expect(promise).rejects.toThrow('disposed');
    expect(worker.terminated).toBe(true);
    expect(classifier.activeDevice).toBeNull();
  });
});
