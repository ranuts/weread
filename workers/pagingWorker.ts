/**
 * 分页 Worker：把整本书的分页/建树搬离主线程，避免大书（《国富论》《三国》）冻结 UI。
 * 只依赖纯核心 `buildTextSyntaxTree`（paging.ts）；用已存的 encoding 直接 TextDecoder 解码，
 * 不引 jschardet/locales，Worker 体积极小。
 */
import { buildTextSyntaxTree } from '@/lib/paging';
import type { ChapterItem, TextSyntaxTree } from '@/lib/transformText';

export interface PagingWorkerRequest {
  id: number;
  content: ArrayBuffer | Uint8Array<ArrayBuffer>;
  /** 导入时探测好的编码（BookInfo.encoding）；缺省 utf-8。 */
  encoding: string;
  clientWidth: number;
  clientHeight: number;
  title: string;
  chapters: ChapterItem[];
  prefaceLabel: string;
}

export interface PagingWorkerResponse {
  id: number;
  tree: TextSyntaxTree;
}

const decode = (content: ArrayBuffer | Uint8Array<ArrayBuffer>, encoding: string): string => {
  try {
    return new TextDecoder(encoding || 'utf-8').decode(content);
  } catch {
    return new TextDecoder('utf-8').decode(content);
  }
};

self.onmessage = (e: MessageEvent<PagingWorkerRequest>): void => {
  const { id, content, encoding, clientWidth, clientHeight, title, chapters, prefaceLabel } = e.data;
  const tree = buildTextSyntaxTree({
    text: decode(content, encoding),
    dims: { clientWidth, clientHeight },
    title,
    chapters,
    prefaceLabel,
  });
  (self as unknown as Worker).postMessage({ id, tree } as PagingWorkerResponse);
};
