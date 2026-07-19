/**
 * 分页 Worker 的主线程客户端：单例 Worker + id 配对的请求/响应。
 * 让阅读页把「整本书分页」交给 Worker，主线程保持流畅（不再冻结数秒）。
 */
import type { ChapterItem, TextSyntaxTree } from '@/lib/transformText';
import type { PagingWorkerRequest, PagingWorkerResponse } from '@/workers/pagingWorker';

export interface PaginateOptions {
  content: ArrayBuffer | Uint8Array<ArrayBuffer>;
  encoding: string;
  clientWidth: number;
  clientHeight: number;
  title: string;
  chapters: ChapterItem[];
  prefaceLabel: string;
}

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, (tree: TextSyntaxTree) => void>();

const getWorker = (): Worker => {
  if (!worker) {
    worker = new Worker(new URL('../workers/pagingWorker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<PagingWorkerResponse>): void => {
      const { id, tree } = e.data;
      const resolve = pending.get(id);
      if (resolve) {
        pending.delete(id);
        resolve(tree);
      }
    };
  }
  return worker;
};

/**
 * 在 Worker 里分页并构建语法树。content 走结构化克隆（不 transfer），
 * 主线程仍可复用同一 content 做「增强后重排」。无 Worker 环境（SSR）reject，调用方兜底。
 */
export const paginateInWorker = (opts: PaginateOptions): Promise<TextSyntaxTree> => {
  if (typeof Worker === 'undefined') return Promise.reject(new Error('no-worker'));
  return new Promise((resolve) => {
    const id = ++seq;
    pending.set(id, resolve);
    getWorker().postMessage({ id, ...opts } as PagingWorkerRequest);
  });
};
