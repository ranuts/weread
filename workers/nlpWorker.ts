import { env, pipeline } from '@huggingface/transformers';
import type { ProgressInfo, TextClassificationPipeline } from '@huggingface/transformers';
import { DEVICE_PRIORITY } from '@/lib/nlp/protocol';
import type {
  ClassifyRequest,
  LabelScore,
  LoadRequest,
  ModelProgress,
  NlpDevice,
  NlpRequest,
  NlpResponse,
} from '@/lib/nlp/protocol';
import { normalizeClassifierOutput } from '@/lib/nlp/score';

// 模型一律走远端 + 浏览器缓存（Cache API），不探测本地路径
env.allowLocalModels = false;
env.useBrowserCache = true;

let classifier: TextClassificationPipeline | null = null;
let activeDevice: NlpDevice | null = null;
let loading: Promise<NlpDevice> | null = null;

const post = (message: NlpResponse): void => {
  self.postMessage(message);
};

/** transformers.js 的进度对象投影成可结构化克隆的窄类型 */
const toModelProgress = (info: ProgressInfo): ModelProgress => {
  const { status } = info;
  const progress: ModelProgress = { status };
  if ('file' in info) {
    progress.file = info.file;
  }
  if ('loaded' in info) {
    progress.loaded = info.loaded;
  }
  if ('total' in info) {
    progress.total = info.total;
  }
  if ('progress' in info) {
    progress.progress = info.progress;
  }
  return progress;
};

/** 按 DEVICE_PRIORITY 依次尝试创建 pipeline，全部失败抛出最后一个错误 */
const createClassifier = async (request: LoadRequest): Promise<NlpDevice> => {
  let lastError: unknown = null;
  const devices = request.device ? [request.device] : DEVICE_PRIORITY;
  for (const device of devices) {
    try {
      classifier = await pipeline('text-classification', request.modelId, {
        device,
        dtype: request.dtype ?? 'q8',
        progress_callback: (info: ProgressInfo) => {
          post({ operationId: request.operationId, type: 'progress', progress: toModelProgress(info) });
        },
      });
      activeDevice = device;
      return device;
    } catch (error) {
      lastError = error;
      classifier = null;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
};

const handleLoad = async (request: LoadRequest): Promise<void> => {
  if (classifier && activeDevice) {
    post({ operationId: request.operationId, type: 'loaded', device: activeDevice });
    return;
  }
  if (!loading) {
    loading = createClassifier(request).finally(() => {
      loading = null;
    });
  }
  const device = await loading;
  post({ operationId: request.operationId, type: 'loaded', device });
};

const handleClassify = async (request: ClassifyRequest): Promise<void> => {
  if (!classifier) {
    throw new Error('Model not loaded, send a load request first');
  }
  if (request.lines.length === 0) {
    post({ operationId: request.operationId, type: 'result', scores: [] });
    return;
  }
  // top_k: null 返回每行全部标签的得分，交给主线程按标签取用
  const output = (await classifier(request.lines, { top_k: null })) as LabelScore[] | LabelScore[][];
  const scores = normalizeClassifierOutput(output, request.lines.length);
  post({ operationId: request.operationId, type: 'result', scores });
};

self.onmessage = async (event: MessageEvent<NlpRequest>) => {
  const request = event.data;
  try {
    if (request.type === 'load') {
      await handleLoad(request);
    } else if (request.type === 'classify') {
      await handleClassify(request);
    }
  } catch (error) {
    post({
      operationId: request.operationId,
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
