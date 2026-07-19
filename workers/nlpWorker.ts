import { AutoModelForSequenceClassification, AutoTokenizer, env, softmax } from '@huggingface/transformers';
import type { PreTrainedModel, PreTrainedTokenizer, ProgressInfo } from '@huggingface/transformers';
import { CLASSIFY_STATUS, DEVICE_PRIORITY } from '@/lib/nlp/protocol';
import type {
  ClassifyRequest,
  LabelScore,
  LoadRequest,
  ModelProgress,
  NlpDevice,
  NlpRequest,
  NlpResponse,
} from '@/lib/nlp/protocol';

// 本地模型（自训 v3）放在应用同源路径下：只从本地加载，不回退 HF 远端
env.allowLocalModels = true;
env.allowRemoteModels = false;
env.useBrowserCache = true;
// 本地模型基路径：必须用「绝对路径」而非绝对 URL——transformers.js 的存在性检查
// 会把 http(s):// 开头的 localModelPath 当成远端而跳过本地文件检查（配合 allowRemoteModels=false
// 就判成文件不存在）。用 pathname（/weread/models/）让本地分支生效。worker 在 /weread/workers/，故上一级。
env.localModelPath = new URL('../models/', self.location.href).pathname;
env.backends.onnx.wasm.numThreads = 1;

// 用 AutoTokenizer + AutoModel 分开加载：pipeline 抽象在 DeBERTa-v2 tokenizer 上会
// 报「this.tokenizer is not a function」，手动 tokenize + 推理更稳
let tokenizer: PreTrainedTokenizer | null = null;
let model: PreTrainedModel | null = null;
let id2label: Record<number, string> = { 0: 'not_title', 1: 'title' };
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

/** 按 DEVICE_PRIORITY 依次尝试加载 tokenizer + model，全部失败抛出最后一个错误 */
const createClassifier = async (request: LoadRequest): Promise<NlpDevice> => {
  const progress_callback = (info: ProgressInfo): void => {
    post({ operationId: request.operationId, type: 'progress', progress: toModelProgress(info) });
  };
  // tokenizer 只需加载一次（与设备无关）
  if (!tokenizer) {
    tokenizer = await AutoTokenizer.from_pretrained(request.modelId, { progress_callback });
  }
  let lastError: unknown = null;
  const devices = request.device ? [request.device] : DEVICE_PRIORITY;
  for (const device of devices) {
    try {
      model = await AutoModelForSequenceClassification.from_pretrained(request.modelId, {
        device,
        // 默认 fp32：DeBERTa-v3 的 int8 量化会坏精度、fp16 转换有图型 bug（见
        // docs/chapter-model-deployment.md 2.0）。体积优化（词表裁剪等）解决前先用 fp32。
        dtype: request.dtype ?? 'fp32',
        progress_callback,
      });
      const cfgLabels = (model.config as { id2label?: Record<number, string> }).id2label;
      if (cfgLabels) {
        id2label = cfgLabels;
      }
      activeDevice = device;
      return device;
    } catch (error) {
      lastError = error;
      model = null;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
};

const handleLoad = async (request: LoadRequest): Promise<void> => {
  if (model && tokenizer && activeDevice) {
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

/** 分批推理的批大小：够大以摊薄前向固定开销，够小以出进度、控峰值内存、不长时间阻塞 worker */
const CLASSIFY_BATCH_SIZE = 64;

const handleClassify = async (request: ClassifyRequest): Promise<void> => {
  if (!model || !tokenizer) {
    throw new Error('Model not loaded, send a load request first');
  }
  const { lines } = request;
  if (lines.length === 0) {
    post({ operationId: request.operationId, type: 'result', scores: [] });
    return;
  }

  const activeModel = model;
  const activeTokenizer = tokenizer;
  const scores: LabelScore[][] = [];
  const total = lines.length;
  // 进入推理即先报 0%，让主线程 UI 从「下载 100%」翻到「识别中」（推理无外部进度源，靠分批推）
  post({ operationId: request.operationId, type: 'progress', progress: { status: CLASSIFY_STATUS, progress: 0 } });

  for (let start = 0; start < total; start += CLASSIFY_BATCH_SIZE) {
    const batch = lines.slice(start, start + CLASSIFY_BATCH_SIZE);
    // padding 按「本批最长」而非全量最长——分批天然降低无谓 padding 与峰值张量体积；
    // attention_mask 屏蔽 padding，逐批 padding 不影响每行 logits。
    const inputs = activeTokenizer(batch, { padding: true, truncation: true, max_length: 128 });
    // mDeBERTa 不使用 token_type_ids；且多个 [SEP] 会让分词器按段落递增 type_id，与训练时
    // （单串输入全 0）不一致，删掉更稳（实测模型本就忽略它，删除不影响正确的 fp32 结果）
    delete (inputs as Record<string, unknown>).token_type_ids;
    const { logits } = (await activeModel(inputs)) as { logits: { tolist: () => number[][] } };
    // logits 形状 [batch, numLabels]，逐行 softmax 后映射成 LabelScore[]
    for (const row of logits.tolist()) {
      const probs = softmax(row);
      scores.push(probs.map((score: number, i: number) => ({ label: id2label[i] ?? `LABEL_${i}`, score })));
    }
    const done = Math.min(start + CLASSIFY_BATCH_SIZE, total);
    post({
      operationId: request.operationId,
      type: 'progress',
      progress: { status: CLASSIFY_STATUS, progress: Math.round((done / total) * 100) },
    });
  }

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
      message: error instanceof Error ? `${error.message}\n${error.stack ?? ''}`.slice(0, 600) : String(error),
    });
  }
};
