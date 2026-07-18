# 章节识别模型的浏览器部署规划（懒加载 / 分包 / 缓存）

> 目标：把章节标题模型接进纯前端 PWA，而**不让绝大多数用户付出下载成本**。
> 前置：模型 v3 已训成（完整验证集 recall 0.879 / precision 0.339，金庸回目 0.945），
> **浏览器端到端推理已跑通并证明正确**（fp32：结构化 0.992 / 金庸回目 0.914 / 正文 0.000，与 PyTorch 一致）；
> 推理设施 `lib/nlp/ChapterClassifier` + `workers/nlpWorker.ts` 已改为本地加载。
> 配套：模型的由来与效果见 [chapter-detection-journey.md](./chapter-detection-journey.md)。
>
> **当前状态**：推理链路全通，唯一阻塞是**体积**（v3 fp32 1.1GB，int8 因 DeBERTa-v3 崩，见 2.0）。
> **选定解法：按语言分小模型 + 换标准注意力骨干**（见 2.3），同时解决体积与量化。

这是两个**不同**的问题，杠杆和收益完全不同，分开处理：

- **懒加载**：_什么时候_才去下模型（多数用户永远不下）。
- **分包 / 减体积**：真要下时，_怎么把模型拆小、拆开、可恢复_（当前走 2.3 的按语言小模型）。

---

## 一、懒加载：最大的杠杆（复用已有的置信度信号）

核心判断：**绝大多数用户不该下这个模型。** 规则层对结构化书（第X章、CHAPTER N）本就是 high 置信度、识别良好；模型只对规则搞不定的书有增量价值。

`detectChaptersDetailed` 已输出置信度（high/medium/low/none）+ 胜出模式家族，直接拿来门控：

```
导入书 → 规则识别（0 成本，永远先跑，结果进 books_chapters 缓存）
  ├─ high 置信度        → 直接用规则结果，永不下模型
  └─ low / none 置信度  → 展示规则结果（或整本一章）+ 一个「目录可能不全，点此 AI 增强」入口
                            └─ 用户点击才下模型 → 进度条 → 重新解析 → 更新目录
                                                 → 结果写 books_chapters（source: 'model'），一本书只解析一次
```

要点：

- **渐进增强，不是强制等待**：先给规则结果 / 兜底，模型是可选的二次提升。
- **门控把「人人下 322MB」变成「碰到难书且主动点了增强的少数人下一次」**。
- 结果持久化到 `books_chapters`（已有），命中缓存的书再打开不重算、不再触发模型。
- 可加策略：用户在设置里选「总是用 AI 增强 / 从不 / 仅在规则失败时提示」（默认第三种）。

> 这一层决定 ~90% 的用户体验，且几乎不碰模型本身，应最先做。它同时验证一个关键假设：**多数用户根本不需要下模型**——上线后看真实下载触发率，再决定第二、三层投入多少。

---

## 二、减体积（当前的**首要阻塞**，见 2.0 血泪教训）

### 2.0 ⚠️ DeBERTa-v3 的量化血泪（实测，2026-07-18）

浏览器端到端已跑通、**fp32 完全正确**（结构化 0.992、金庸回目 0.914、正文 0.000，与 PyTorch 一致），
但**体积是当前唯一阻塞**：

| 格式                                    | 体积      | 浏览器结果                                        | 结论                              |
| --------------------------------------- | --------- | ------------------------------------------------- | --------------------------------- |
| **fp32**                                | **1.1GB** | ✅ 正确                                           | 太大，不能直接上                  |
| **int8**（per_channel=False）           | 338MB     | ❌ logits 几乎取反（第一章 title=0.01）           | **DeBERTa-v3 对 int8 敏感，坏了** |
| **int8**（per_channel=True）            | ~340MB    | ⚠️ 改善但仍错（第一章 0.45、金庸 0.01）           | 仍不可用                          |
| **fp16**（onnxconverter keep_io_types） | 559MB     | ❌ 图型错误（embeddings Cast float16 vs float32） | 转换需处理 Cast 节点              |

**根因**：DeBERTa-v3 的 disentangled attention 对 int8 动态量化本质不友好（社区已知问题）。
**下一步该试**（按优先级）：

- **词表裁剪先做**（见下 2.1）：把 fp32 的 1.1GB 砍到 ~500-600MB，再叠加 fp16 有望到 ~300MB；
- **修 fp16 转换**：用 `op_block_list` 排除 Cast/LayerNorm 等，或用 optimum 的 fp16 优化路径而非裸 onnxconverter；
- **QDQ / 静态量化 + 校准集**：动态量化太糙，带校准的静态 int8 可能救回精度；
- 实在不行**换更小骨干**（见下）。

> **经验（部署）**：导出后**必须用部署运行时**（onnxruntime-web / 浏览器）验证**量化模型**的预测，
> 而不是只信 PyTorch 或只验证过别的版本。v3 导出时我没重验量化模型，直到浏览器接入才发现 int8 坏了，
> 白跑一轮。量化对不同架构差异极大（同样 int8，RoFormer 没事、DeBERTa-v3 崩）。

### 2.1 词表裁剪（最大头）

mDeBERTa 的体积里近 2/3 是 25 万 token 的多语言 embedding。裁到实际用到的语系（CJK + 拉丁 + 西里尔，约 5-8 万 token），精度几乎无损。做成两档：**桌面全量 / 移动裁剪版**，按 `navigator.deviceMemory`、UA 选。（当初保留全量词表就是为多语言，这里正好落地分档。）**这是绕开量化难题的最稳一步**——先把 fp32/fp16 的体积压下来。

### 2.2 换更小骨干（能降一个数量级，但工作量大）

关键洞察：**加了格式特征后，很多判别信号已在 token 里**，模型未必需要 base 级。可蒸馏小学生模型，或试更小的、量化更友好的多语言编码器（如 MiniLM 系）。留作后续大优化。

### 2.3 ✅ 选定方向：按语言分模型 + 换标准注意力骨干（同时解决体积与量化）

**决策（2026-07-18）**：不再走「裁剪那个多语言 mDeBERTa」的路，改为**按语言训练多个小模型，页面按需加载**；多语言 mDeBERTa v3 保留作兜底。

> **✅ 已验证成立（2026-07-18）——中文版跑通端到端**：
>
> - base 选型踩了一步：**bert-base-chinese 太弱**（recall 0.43，连「第一章 风雪夜」都判 0.02，只认高频词「后记」——弱 base 只记忆不泛化）；换 **chinese-roberta-wwm-ext** 后结构化标题全部拿下（第一章 0.948、第二章 0.956、后记 0.957），eval recall 0.81。
> - **int8 量化不崩**（决定性判据）：roberta int8 后第一章 0.921（fp32 0.948，掉点微乎其微），对照 DeBERTa-v3 的 int8 第一章 0.01（取反崩溃）。**证明「标准注意力 int8 友好」这个核心假设成立**。
> - **体积 103MB**（v3 是坏掉的 338MB）。
> - **浏览器 onnxruntime-web int8 实测一致**：第一章 0.917、第二章 0.939、后记 0.953、正文 0.001，与 Python 一致。
> - 唯一弱点：裸金庸短语（去数字前缀的「青衫磊落险峰行」）0.21，比 v3 的 0.945 弱；但真实武侠回目带数字前缀（「一 青衫磊落险峰行」）能接住，结构化书（绝大多数）完美。
> - 产物：`ml/train/out/model_zh`、`ml/export/out/zh/model_quantized.onnx`、部署于 `public/models/chapter-title-zh/`。
> - **经验**：「量化友好」和「够强」是两个维度——bert-base-chinese 占前者不占后者，DeBERTa-v3 反之，chinese-roberta-wwm-ext 两者兼得。选 base 要同时验证这两点。

> **✅ 英文版跑通（2026-07-19）**：`distilbert-base-uncased`（6 层，更小）→ eval recall 0.94（英文标题规整）。
> **int8 与 fp32 在真实 dev 数据上逐一相同**（Chapter N - Title 0.999），**67MB**。浏览器端到端：英文书自动
> 检测 en → 加载 chapter-title-en（WebGPU）→ 4 章全识别 763ms。产物 `ml/train/out/model_en`、
> `ml/export/out/en`、`public/models/chapter-title-en/`；已在 `lib/nlp/detectLanguage.ts` MODEL_BY_LANG 注册 en。
> 注意：英文标题格式规整、规则覆盖本就好，英文模型边际价值小于中文（中文有金庸空格回目规则完全接不住）。

**前端接入（已落地）**：`detectLanguage`（CJK/拉丁占比）自动选模型 → `detectChaptersWithModel`
（预过滤短+非句末标点行，模型标题作无编号家族 union 规则 → validate.ts 竞争过滤）→ 置信度门控 UI
（规则 low/none 才显「AI 增强」，懒加载模型 + 进度，结果缓存 source:'model'）。见 [journey 9.9](./chapter-detection-journey.md)。

**为什么这条路更好**——体积的病根有两个（词表大 + 骨干是 DeBERTa-v3 不好量化），按语言分 + 换骨干**一次解决两个**：

|             | 多语言 mDeBERTa-v3               | 中文版 bert-base-chinese | 中文版 MiniLM-L6 |
| ----------- | -------------------------------- | ------------------------ | ---------------- |
| 词表        | 25.1 万（771MB 嵌入）            | 2.1 万（~65MB 嵌入）     | 小               |
| 骨干        | 12 层 340MB                      | 12 层 340MB              | **6 层 ~170MB**  |
| int8 量化   | **崩**（disentangled attention） | ✅ 标准注意力，正常      | ✅ 正常          |
| int8 后体积 | 338MB（坏的）                    | **~100MB**               | **~50MB**        |

- **关键点：换掉 DeBERTa-v3 骨干，量化墙就没了。** DeBERTa-v3 的 int8 崩溃源于它特殊的 disentangled attention；换成标准 BERT/MiniLM，int8 正常——本会话早期那个 RoFormer 占位模型 int8 就没事，正是标准注意力的佐证（见 [journey 文档](./chapter-detection-journey.md)）。
- **按语言分让词表天然小**：中文版只需中文词表（~2万），不必背 25 万多语言词表。
- **格式特征语言无关**：`ml/textfeat.py` / `lib/nlp/features.ts` 一套喂所有模型，零改动。

**架构**：

```
页面检测书的语言（CJK 占比 / 拉丁占比，极简，无需额外模型）
  ├─ 中文书   → 中文版（bert-base-chinese 或中文 MiniLM，int8 ~50-100MB）
  ├─ 英文书   → 英文版（MiniLM / distilbert，int8 ~50MB）
  ├─ 其他语言 → 逐步补（缺什么补什么）
  └─ 混合/罕见 → 多语言 mDeBERTa v3 兜底（保留，桌面 fp32，下载罕见）
```

**训练数据现成**：中文 epub 7983 + 武侠 438；英文 1840 本 txt（已用 907，可加）。管线搭好，换 base + 换数据子集即可训。

**代价（诚实）**：要训 N 个模型（但每个又小又快）；多语言 v3 兜底的体积/量化问题不解决，但兜底罕用可接受（桌面 fp32 或以后再裁）；换 base = 从头训，不复用 v3 权重。

**首个落地**：中文版（主场景 + 数据最多），base 先试 `bert-base-chinese`（已知稳、词表 2.1万、int8 友好）。**成败判据：int8 量化后金庸回目「青衫磊落险峰行」还判对不对**——验证「标准注意力 int8 不崩」这个关键假设。想更小再试中文 MiniLM。

---

## 三、分包（怎么把字节拆开传）

1. **JS/WASM 运行时代码分包（真正的 code splitting，先做，近零成本）**
   transformers.js + onnxruntime-web 的运行时（WASM 后端几 MB）**不进主 bundle**。在 worker 里动态 import：`const { pipeline } = await import('@huggingface/transformers')`，只在要用时加载；ORT 的 WASM 后端文件也是首次用才拉。这块和模型权重是两件独立的事。

2. **权重 Range 流式下载（进度 + 断点续传）**
   322MB 用 HTTP Range 分块拉，配进度条与**断点续传**（移动网络必然会断）。ORT Web 可从 ArrayBuffer 加载模型，故可自控分块与恢复。这是「分包」在权重层面的主要形态——不是逻辑拆分，是**传输可控 + 可恢复**。

3. **ONNX external data（图/权重分离）**
   ONNX 支持权重存独立文件（`model.onnx` 小图 + `model.onnx_data` 权重），onnxruntime-web 可分别加载。单模型收益有限，但要做「先加载图、权重后到」的渐进式加载时是基础。

---

## 四、缓存与存储（下一次就够，离线可用）

- **OPFS 优先于 Cache API 存大模型**：322MB 大 blob，OPFS 配额更可预期、更适合。transformers.js 可配自定义缓存后端。
- **`navigator.storage.persist()`**：请求持久化存储，否则 iOS Safari 在存储压力下会驱逐模型，用户又得重下。
- **版本化 immutable URL + 清单 JSON**：模型文件名带版本（如 `chapter-title.v2.q8.onnx`），CDN 设长缓存头（immutable）；`public/` 放 manifest（version / url / size / sha256），前端对比决定是否更新。
- **禁止 Service Worker precache 模型**：那等于给所有用户强制下载。模型只走**运行时按需缓存**，SW 不预缓存。

---

## 五、移动端特殊处理

- iOS PWA 单页内存约 1-1.5GB，322MB 模型 + ORT 运行时峰值可能触顶。
- 策略：移动端默认裁剪版（~150MB）或 q4；`deviceMemory` 低的机器直接只用规则层（不提供模型增强，或提示「本设备暂不支持」）。
- **真机压测必做**：加载峰值内存、Cache/OPFS 配额、被系统杀掉的概率。

---

## 六、落地建议（分层，从零成本到高投入）

| 层    | 做什么                                                           | 成本             | 谁受影响                        |
| ----- | ---------------------------------------------------------------- | ---------------- | ------------------------------- |
| **0** | 规则先跑；high 置信度永不下模型；low/none 显示「AI 增强」入口    | 已有信号，改 UI  | 所有人，多数在这层就完事        |
| **1** | 运行时代码动态 import + 权重 Range 流式 + 进度条 + OPFS 持久缓存 | 中               | 点了「AI 增强」的少数人，下一次 |
| **2** | 按语言小模型（2.3）：先中文版 bert-base-chinese int8 ~100MB      | 中（重训，但轻） | 按书语言各下对应小模型          |
| **3** | 补更多语言版 + manifest 按语言选 + 多语言 v3 兜底                | 逐步             | 长尾语言 / 桌面兜底             |

**推荐顺序**：

1. **先做第 0 层**（置信度门控 + 渐进 UX + 「AI 增强」按钮）。纯前端，不碰模型重训，决定 90% 体验，并验证「多数用户不需要下模型」的假设。
2. **接入时顺带第 1 层**（代码分包 + 流式 + OPFS）。这一步同时完成「模型接进浏览器」这件事本身。
3. **第 2 层：中文版小模型**（换标准注意力骨干解决量化）。成败判据：int8 后金庸回目仍判对。
4. **第 3 层按需补语言**，多语言 v3 作兜底。

---

## 七、与现有代码的衔接点

- `lib/chapter/index.ts` `detectChaptersDetailed` 的置信度 → 门控是否提示「AI 增强」。
- `store/chapters.ts` `resolveBookChapters` → 增加 `source: 'model'` 分支，模型结果走同一缓存与失效逻辑（`CHAPTER_ALGO_VERSION` / manual 保留）。
- `lib/nlp/ChapterClassifier` + `workers/nlpWorker.ts`（P2 已建）→ 改为加载**本地/CDN 模型**（transformers.js `env.localModelPath` 或直接 URL），而非 HF modelId；进度回调已有（`onProgress`），接进度条。
- `lib/nlp/features.ts` → 推理时对每一候选行算特征、拼 `makeModelInput`，喂给分类器（与训练侧 `ml/textfeat.py` 逐字一致，已被测试锁定）。
- 模型输出（逐行标题概率）→ 阈值化成候选 → **union 到规则候选** → 交 `validate.ts` 结构层过滤（高召回低精度靠这层收敛）。
- `public/models/` 放模型文件与 manifest（`.gitignore` 排除大文件，走 CDN）。

---

## 八、待验证 / 开放问题

- 阈值定多少：模型 recall 0.90+ 但 precision 0.24，结构层能否把假阳性清干净，需 app 实测（金庸 / 四世同堂 / 英文书）后定阈值。
- 词表裁剪后精度损失的实测值。
- q4 相对 int8 的精度损失。
- iOS 真机内存峰值与 OPFS 配额上限。
- 触发率：上线第 0 层后，实际有多少书落到 low/none、多少用户点了「AI 增强」——决定后续投入。

---

## 九、Cloudflare 部署可行性（2026-07-19 评估）

**结论：可行，但必须把「代码」与「模型」拆成两条线部署。**直接把 `dist/`（含 1GB 模型）整个推 Pages 不可行。

### 9.1 app 本体 → Cloudflare Pages（原生兼容）

- 构建产物是**纯静态 SSG**：`bin/build.sh` 跑 SSR bundle → `bin/build-ssg.js` 预渲染每条路由为静态 HTML → **删除 `dist/server`、`dist/client`**，`dist/` 只剩静态文件。无运行时 Node 服务器（DB / 推理全在浏览器 Worker）。→ Pages 纯静态托管即可，比现在的 GitHub Pages 更快。
- **需改 base path**：全站硬编码 `/weread` 子路径（`vite.config.ts` `base:'/weread'`、`views/client.tsx`、`app.tsx` 的 `manifest-url`、`router` base）。CF Pages 部署在根域名要改成 `/`；保留子路径则要配 Pages 路由规则，改 base 更干净。

### 9.2 模型 → Cloudflare R2（Pages 装不下）

- **Pages 有 25 MiB / 单文件硬上限**。三个 onnx 全部超限：mdeberta fp32 **1.0GB**、zh int8 **99MB**、en int8 **64MB**。且 `.gitignore` 已排除 `public/models/`，git 构建根本拿不到。
- **R2 对象存储**：无单文件限制、S3 兼容、**出网流量免费**（正适合大模型下载）。建公开 bucket / 绑自定义域，`workers/nlpWorker.ts` 的 `env.localModelPath` 或远程 host 指向 R2 URL。模型走独立发布管线，与代码解耦（顺带解决「模型不进 git」）。
- **配套**：R2 配 CORS 允许 app 域名跨域拉 onnx；模型文件名带版本 + `Cache-Control: immutable`（配合已有 Cache API / OPFS 缓存，见第四节）。
- **顺手删 1.0GB 的 mdeberta 兜底**：int8 崩、只能 fp32、几乎不用，放 R2 用户也不会下 1GB。R2 上只留 zh(99MB) / en(64MB)。

---

## 十、模型压缩：哪些有效、哪些是误区

先纠一个常见误区（也是本轮提问的出发点）：

> **「把模型构建成 wasm 再 gzip」是一次范畴错误。**
> 模型是**权重（数据）**，WASM 是**运行时（代码）**。onnxruntime-web 的 `.wasm` 是*执行*模型的引擎（几 MB，那块该 gzip/brotli），模型本身不会因为「编译成 wasm」变小——权重就是权重，换个容器不改变字节量。

真正能动模型体积的杠杆，按「收益 / 工作量」排序：

### 10.1 传输层压缩（gzip / brotli）—— 就是问题里「再 gzip」那步

- **有效但边际有限**。模型已是 **int8 量化**，量化权重接近高熵，gzip/brotli 通常只压 **~10-20%**（fp32 略好些但权重仍高熵）。
- **brotli > gzip**，R2 可预压出 `.br` 并配 `Content-Encoding` 由浏览器透明解压。
- **注意**：压的是*传输字节*，浏览器 / ORT 解压后**内存占用不变**（内存峰值仍是原始大小，见第五节 iOS 顾虑）。
- 定位：**零成本叠加项**，能省点下载时间，但不是决定性杠杆。实测值应验证（int8 权重压缩率因分布而异）。

### 10.2 量化深度：int8 → int4（收益最大的下一步）

- 现状 int8 已是 fp32 的 4×（zh 1.1GB→103MB）。**int4 / 4-bit 权重量化**（ORT 的 `MatMulNBits`、AWQ / GPTQ 系）可再约减半：zh ~50MB、en ~32MB。
- **precision 风险**：DeBERTa-v3 连 int8 都崩（见 2.0），但本项目已换 **标准注意力骨干（roberta / distilbert），量化友好**——int4 有较大概率扛得住，**必须实测验证**（判据同 2.3：金庸回目 / 第一章仍判对）。
- 定位：**中等工作量、收益最大**，是压缩方向的主攻点。

### 10.3 词表 / embedding 裁剪（CJK 收益小、英文尚可）

- BERT/RoBERTa 的 embedding 表占参数不小（chinese-roberta ~21k 词表 × 768 ≈ 16M 参数）。裁到实际用到的 token 可省一块。
- **但中文需广字符覆盖，裁剪空间有限**；英文 distilbert（30k 词表）相对可裁。收益中等，且要重导。

### 10.4 换更小 / 更蒸馏的骨干（最大降幅，最高成本）

- distilbert 已是 6 层蒸馏。可再往 MiniLM-L6 / TinyBERT / 4 层走，能再降一个档，但要**重训**（工作量最大，且要重新验证能力边界）。

### 10.5 其它容器 / 格式（不改字节量，别指望减体积）

- ONNX `.ort` 优化格式：加载更快，**体积基本不变**。
- ONNX external data（图 / 权重分离）：是「先加载图、权重后到」的渐进式加载基础（见 3.3），**不减总字节**。

### 压缩落地顺序建议

1. **零成本先叠**：R2 上 brotli 传输压缩（~10-20%）+ 删 1GB mdeberta。
2. **主攻 int4**：验证 roberta/distilbert int4 精度，过关则 zh/en 再减半（→ ~50MB / ~32MB，是最实在的一跳）。
3. **英文顺带裁词表**；中文词表裁剪收益小，优先级低。
4. **换更小骨干**：仅当 int4 后仍嫌大、且愿意重训时再上。

---

## 附：通用背景知识（已拆分）

「模型在浏览器里怎么加载运行」与「模型文件格式概览（不止 ONNX）」是与本项目部署解耦的通用知识，已移到 [model-runtime-and-formats.md](./model-runtime-and-formats.md)。本文只保留本项目的部署工程决策。
