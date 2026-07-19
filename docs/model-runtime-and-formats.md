# 模型运行机制与文件格式（通用参考）

> 与本项目具体部署解耦的通用知识：**模型在浏览器里到底怎么被加载运行**、**模型文件有哪些格式、各自区别、怎么选**。
> 本项目的具体落地（懒加载 / 减体积 / 缓存 / Cloudflare / 压缩方案）见 [chapter-model-deployment.md](./chapter-model-deployment.md)。
> 模型的由来与效果见 [chapter-detection-journey.md](./chapter-detection-journey.md)。

---

## 一、模型在浏览器里到底怎么加载和运行

一句话：**模型是服务器上的一堆静态文件，被 JS 用 `fetch` 下载、缓存，再交给 WASM/WebGPU 引擎逐行算概率。「模型的字节」和「跑模型的代码」是两件事。**

### 1.1 模型 = 一个文件目录（不进 JS bundle）

```
public/models/chapter-title-zh/
├── config.json            # 模型结构 + id2label（0=not_title 1=title）
├── tokenizer.json         # 分词器：文字 → 数字 id
├── vocab.txt              # 词表
└── onnx/model_quantized.onnx   # 99MB：权重（模型的「大脑」）
```

JS 代码里没有这些字节。运行时靠 HTTP 下载它们，和下载一张图片同理。**这就是「构建成 wasm 不减体积」的根因**：99MB 是 `.onnx` 权重文件本身，换什么代码去读它都不变。

### 1.2 三层调用栈

```
页面（主线程）
  │ postMessage
  ▼
workers/nlpWorker.ts（Web Worker，后台线程，不卡 UI）
  │ 调用
  ▼
@huggingface/transformers（transformers.js，npm 库）
  │ 底层调
  ▼
onnxruntime-web  ←── 这才是真正的 WASM：执行模型的「引擎」（几 MB 代码）
```

**关键区分**：最底层的 `onnxruntime-web` 确实是 WASM，但它是*执行引擎（代码）*，不是模型*权重（数据）*。要 gzip/brotli 的是这块引擎（几 MB），跟 99MB 的模型是分开的两个东西。引擎优先用 **WebGPU**（显卡加速），失败退回 **WASM**（纯 CPU）。

### 1.3 一次完整流程（本项目「AI 增强」为例）

1. **选模型** `lib/nlp/detectLanguage.ts`：数前 2 万字 CJK/拉丁占比 → `chapter-title-zh` 或 `-en`。
2. **加载** `store/chapters.ts` → `classifier.load({ modelId, dtype:'q8', onProgress })` → worker 里 `AutoTokenizer.from_pretrained` + `AutoModelForSequenceClassification.from_pretrained` 用 fetch 下载。`dtype:'q8'` 决定去拿 `onnx/model_quantized.onnx`（int8 版）。`env.useBrowserCache=true` → 第二次秒开、离线可用。
3. **逐行判断** `lib/chapter/modelDetect.ts`：全书切行 → **预过滤**（够短 + 不以句末标点结尾，把 33s 压到 1.8s）→ 每候选行拼 `[特征][SEP]上一行[SEP]本行[SEP]下一行` → `tokenizer(lines)` 文字转 id → `model(inputs)` 出 logits（这步跑 WASM/WebGPU）→ `softmax` 转 0~1 概率。
4. **收敛** 概率 ≥ 阈值 (0.5) 的行 → 模型家族候选 → union 规则候选 → `validate.ts` 结构层过滤 → 缓存 `source:'model'` 进 IndexedDB，重开走缓存不再跑模型。

**减体积只能改权重文件本身**（量化 int8→int4 / 词表裁剪），不是换代码容器——因为字节在 `.onnx` 里。

---

## 二、模型文件格式概览（不止 ONNX）

先建立一个分类维度：**只存权重** vs **权重 + 计算图**。

- **只存权重**（safetensors、.pt）：一堆数字，本身不知道怎么算，必须配套模型代码（Python/transformers）才能跑。用于训练与分享。
- **权重 + 计算图**（ONNX、GGUF、TFLite…）：自带「怎么算」的描述，自包含、可直接部署推理。**浏览器/边缘部署要的是这一类。**

### 2.1 主流格式一览

| 格式                    | 生态               | 含计算图  | 典型用途                                              | 浏览器可跑             |
| ----------------------- | ------------------ | --------- | ----------------------------------------------------- | ---------------------- |
| **safetensors**         | Hugging Face       | ❌ 仅权重 | 训练/分享权重，取代不安全的 pickle `.pt`              | ❌（需模型代码）       |
| `.pt`/`.pth`            | PyTorch            | 部分      | 训练 checkpoint（pickle，能执行任意代码，有安全风险） | ❌                     |
| **ONNX** `.onnx`        | 跨框架标准         | ✅        | 跨平台/边缘/**浏览器**推理，量化友好                  | ✅ onnxruntime-web     |
| `.ort`                  | ONNX Runtime       | ✅        | ONNX 的移动端优化二进制（加载更快，体积基本不变）     | ✅                     |
| **GGUF**                | llama.cpp / Ollama | ✅        | **本地跑 LLM**（CPU/Metal/CUDA），激进量化 Q4_K_M 等  | 少数 wasm 移植，非主流 |
| **TFLite** `.tflite`    | Google             | ✅        | Android/移动端                                        | 有 TF.js，但另一套     |
| **CoreML** `.mlpackage` | Apple              | ✅        | iOS/Mac 神经引擎                                      | ❌                     |
| **TensorRT** `.engine`  | NVIDIA             | ✅        | 特定 N 卡上的极致性能（编译后不可移植）               | ❌                     |
| OpenVINO IR             | Intel              | ✅        | Intel 硬件                                            | ❌                     |
| MLC/WebLLM 权重         | Apache TVM         | ✅        | 浏览器里跑 LLM（编译 WebGPU shader + 自有权重格式）   | ✅（专为此）           |

### 2.2「哪个最好」——没有通用最优，只有分场景最优

- **存/分享权重**（研究、HF Hub）：**safetensors** 已胜出，取代 pickle。
- **本地跑 LLM**（Ollama/llama.cpp/LM Studio）：**GGUF** 事实标准。
- **跨平台 / Web / 边缘部署通用模型**（非 LLM 或中小模型）：**ONNX** 是最通用的开放标准。
- **特定硬件极致性能**：厂商编译格式（N 卡 TensorRT、苹果 CoreML）。

### 2.3 本项目为什么是 ONNX（选型正确）

浏览器 + 非 LLM 分类器 + 跨设备 + 需量化 → **ONNX 是目前唯一成熟解**：

- safetensors 只有权重，浏览器里没有模型代码跑不起来；
- GGUF 面向 llama.cpp 本地 LLM，不是浏览器/分类模型的路子；
- CoreML/TensorRT/TFLite 都绑单一平台，违背「一份产物跑所有设备」。

ONNX 同时给了：一份产物跨端、onnxruntime-web 的 WASM/WebGPU 后端、以及成熟的量化工具链（fp32/fp16/int8/int4）。**注意量化精度（int8/int4）与文件格式是两个正交维度**——都在 ONNX 这个容器里选（压缩手段见 [chapter-model-deployment.md](./chapter-model-deployment.md) 第十节）。
