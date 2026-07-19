# TXT 章节识别与标题提取 — 实施计划

> 分支：`feat/txt-chapter-detection`
> 目标：对用户导入的任意格式 txt，自动识别章节边界并提取标题。
> 架构：三层规则流水线为基座，逐行分类模型（浏览器端 ONNX 推理）作为候选生成的增强层。
> 制定日期：2026-07-16
>
> **⚠️ 本文是初版阶段计划，部分已被后续实践更新。当前进展与决策以这两份为准**：
> [chapter-detection-journey.md](./chapter-detection-journey.md)（历程 + 16 条经验 + 里程碑）、
> [chapter-model-deployment.md](./chapter-model-deployment.md)（部署方向：按语言小模型）。
>
> **一句话现状（2026-07-18）**：规则层上线级；模型 v3 训成（金庸回目 0.945）且浏览器 fp32 端到端验证正确；
> 唯一阻塞是体积（DeBERTa-v3 int8 崩），已选定「按语言训标准注意力小模型」解决。

## 总体架构

```
txt 文本
  │
  ├─ 1. 候选生成（每行打分）
  │     ├─ 规则模式库（零成本，始终启用）
  │     └─ mDeBERTa 行分类器（可选增强，模型已缓存时启用）
  │
  ├─ 2. 全局验证（语言无关，始终启用）
  │     ├─ 模式家族分组 + 编号递增序列检查
  │     ├─ 章节间距均匀性检查
  │     └─ 总数 sanity check（过少/过多 → 降级下一家族）
  │
  └─ 3. 兜底（无任何命中）
        └─ 空行分块 / 固定字数切分（保留现有整本一章逻辑）
```

关键原则：**模型只替换/增强第 1 层**。第 2 层全局验证是精度的真正来源且语言无关，
无论模型是否启用都必须经过。

## Phase 1 — 规则层（可独立上线）✅ 已完成（2026-07-16，c986090）

新增 `lib/chapter/` 模块：

- `patterns.ts` — 多语言标题模式库：
  - 中文：`第[一二两三四五六七八九十百千零〇0-9]+[章节卷回部集话篇幕]`（行首锚定 + `m`）、
    特殊章节词（序章/楔子/引子/前言/后记/尾声/番外/终章）、编号式（`一、` `1.` `01 ` `【】`）
  - 英文：`Chapter/CHAPTER/Section/Part + 数字`、罗马数字独行
  - 日文：`第X話/章`；其他语言按需补充（参考 Legado 社区规则库、calibre structure detection）
- `candidates.ts` — 按行切分，行长过滤（≤ 50 字符）+ 模式匹配，输出候选行及其特征
  （行长、模式家族、编号值、前后空行、文中偏移）
- `validate.ts` — 全局验证：家族分组 → 编号单调性评分 → 间距均匀性 → 选最优家族，剔除离群点
- `index.ts` — 入口 `detectChapters(text: string): ChapterItem[]`，串联三层

改造现有代码：

- 修复 `lib/transformText.ts` 中 `extractChapters` 的正则空格 bug 与行首锚定缺失（或直接废弃，指向新模块）
- `transformTextToExpectedFormat`：无 `<caption-title>` 标签时调用 `detectChapters` 而非整本一章

测试：

- 引入 vitest（当前项目无测试框架）
- fixtures：中文网络小说、英文 Gutenberg、无格式纯文、伪标题干扰样本（正文含「第二天」「看到第三章」）

**验收**：对 fixtures 集合章节边界准确率 ≥ 95%，无网络依赖，可直接合入主干上线。

## Phase 2 — 浏览器推理基础设施（模型无关）✅ 基本完成（2026-07-16）

- 依赖：**选定 `@huggingface/transformers`**（放弃裸 onnxruntime-web：mDeBERTa 需要
  SentencePiece 分词器，transformers.js 内置且自带 Cache API 缓存与进度回调，省掉整个手写层）
- `workers/nlpWorker.ts`：operationId 关联的消息协议（与 dbWorker 风格一致），
  WebGPU 优先 / WASM 兜底 / `device` 参数可强制指定，模型走 Cache API（`transformers-cache`）
- `lib/nlp/`：protocol.ts（双端共享类型）、score.ts（输出归一化与标题概率映射）、
  index.ts（`ChapterClassifier` 客户端封装，懒建 worker，promise 化 API）
- 加载策略：**懒加载**。规则层置信度高时完全不下载模型；置信度低（无主模式家族/序列断裂多）
  或用户手动触发「增强解析」时才拉取（P4 接线）
- 移动端：UA/内存探测，iOS 上默认只用规则层或提供裁剪版模型（见 Phase 3）

**验收结果**：占位模型（Xenova/tiny-random-RoFormerForSequenceClassification）在
桌面 Chrome 通过全链路：下载（149 个进度事件）→ WebGPU 推理 → 强制 WASM 推理 →
Cache API 持久化 → 新 worker 二次加载 ~600ms。**待办：iOS Safari 真机验证**。

## 路线修正（2026-07-17，语料驱动）

拿到真实语料（`literature-books-master`：273 txt + 85 epub）后，在其上评估规则层：

- 规则层 high 置信度仅 147/273（54%），**完全未识别 96/273（35%）**，远低于计划里写的「~95%」
- 尝试补正则接住失败样本，**一次改动修好 28 本却碰坏 13 本、另有 23 本误报爆炸**——
  纯正则会打地鼠已被数据证实
- 关键发现：85 个 epub 自带结构化目录（`toc.ncx`），是**独立于规则的 ground truth**，
  这解除了 P3 原来的「训练数据死结」（自动标注只能来自自己正则）

**决策：提前启动 P3，规则层冻结在高精度（P1 版本）当自动标注器 + 兜底。**
P4 的目录编辑 UI 顺延到模型就位后（用户修正即增量标注）。

## Phase 3 — 训练管线（`ml/` 子项目，产物回流）✅ 数据管线已验证（2026-07-17）

已落地 `ml/`（Python + tsx，不进 npm 构建）：

- `data/build_dataset.py`：epub → 行级标签 JSONL（prev/text/next/label）。**本机已跑通**：
  84/85 epub 解析成功，产出 23.6 万行、7983 标题正样本、正负比 1:29。标签是语义标题
  （「累到无力抵抗」「第 1 节 批《苦恋》」），正是规则接不住的那类
- `train/train.py`：mDeBERTa-v3-base 逐行分类微调，按书划分 train/eval 防泄漏（需 GPU）
- `export/export_onnx.py`：ONNX 导出 + int8 量化（需 optimum）
- `eval/evalRules.ts`：规则层语料评估器（对照基线，high=147）
- 详见 `ml/README.md`

**下一步**：GPU 机器上跑 `train.py`，产出模型 → `export_onnx.py` 转 ONNX →
放 `public/models/` → 前端 `ChapterClassifier` 换 modelId 接入（P2 设施已就绪）。

## Phase 3（原始计划，保留参考）

独立目录 `ml/`（不进 npm 构建）：

- `data/`：epub 语料 → txt + 行级标签自动生成（epub 目录即真值）；规则层上线后收集的
  bad case 人工标注集（目标数百条疑难样本）
- `train/`：mDeBERTa-v3-base 微调，任务为行级二分类，输入 = 目标行 + 前后各 1–2 行上下文窗口
- `eval/`：多语言 held-out 集，重点考察零样本迁移语言（日/法/德/俄）
- `export/`：optimum 导出 ONNX → int8 动态量化 → 两个产物：
  - `full`（全量 250k 词表，~280MB，桌面端，100 语言覆盖）
  - `pruned`（按 CJK + 拉丁 + 西里尔裁剪词表，~150–200MB，移动端）
- 模型托管：HF Hub 或自有 CDN，**不进 git 仓库**；`public/` 只放模型清单 JSON（版本、URL、校验和）

**验收**：held-out 集上行分类 F1 显著高于纯规则候选层；zh/en 微调后日语零样本可用。

## Phase 4 — 集成与数据回流（模型无关部分 ✅ 2026-07-17）

- ✅ 置信度信号：`detectChaptersDetailed` 输出 high/medium/low/none + 胜出家族 id，
  作为后续模型增强的触发依据（high 直接用；low/none 提示增强）
- ✅ 解析结果持久化：`books_chapters` store（DB v2），`store/chapters.ts` 的
  `resolveBookChapters` 编排「缓存 → caption 标注 → 规则识别 → 写缓存」，
  `CHAPTER_ALGO_VERSION` 变更时自动失效重算（manual 修正除外）；阅读页双端已接线
- ✅ 附带修复：WebDB / dbWorker 连接补上 `onversionchange` 自动断开——否则任何
  DB 版本升级都会被旧连接（worker 或其他标签页）永久阻塞
- ✅ 模型增强接线：low/medium/none 显示「AI 增强」按钮（`canEnhanceWithModel`），
  点击懒加载语言模型 + 带进度；成功重建语法树、缓存 source:model（2026-07-19）
- ⬜ 目录手动编辑 UI：用户可增删改章节点；**用户修正即标注数据**（source: manual），
  本地留存，（可选、需用户同意）匿名回传作为下一轮训练语料
- ✅ i18n：新增文案走 `locales/`（enhanceCatalogue 等）

## Phase 5 — 自动增强 + 模型预取 + SW 缓存版本化 + 推理优化（2026-07-19 起）

面向真实体验的落地：从「规则先出、模型靠手动按钮」升级为「打开网页后台预取模型、
规则完全失败的书打开时自动增强」，并修掉 SW 缓存导致的「代码更新了却吃旧缓存」。

### 5.1 已完成（2026-07-19）

- **规则 none 打开时自动增强**（`pages/book-detail` `loadBook`）：规则 `confidence==='none'`
  且该语言有模型时，按 `canAutoEnhance(lang)` 决定是否自动 `runEnhance()`——不再只靠按钮。
- **模型后台预取**（`lib/nlp/modelCache.ts` 新增）：首页 client 侧 `prefetchModelsForLangs([uiLang()])`，
  `requestIdleCallback` 空闲拉取本地语言模型文件进 SW 缓存；受网络守卫约束
  （`navigator.connection.saveData` / `2g|slow-2g` / `localStorage['weread_disable_model_prefetch']` 时跳过）。
  `canAutoEnhance`：模型已缓存 → 必自动；未缓存但网络允许 → 也自动（带进度）；省流量未缓存 → 回退手动按钮。
- **SW 缓存版本化**（`public/sw.js` 重写 + `bin/build-ssg.js` 注入）：
  - 资源缓存 `weread_assets_${BUILD_ID}`，`BUILD_ID` = 构建注入的 ISO 时间戳（每次构建必变
    → sw.js 字节变 → 浏览器检测到新 SW；activate 删非当前版本缓存 → 新代码即时生效）。
  - HTML 导航**网络优先**（拿最新代码，离线回退缓存）；`skipWaiting` + `clients.claim`；
    注册加 `updateViaCache:'none'`（避免 HTTP 缓存把旧 sw.js 藏起来）。
  - **模型走固定名 `weread_models` 缓存、缓存优先、跨版本保留**——发版不重下 100MB 权重。
  - dev（未注入 BUILD_ID / 预缓存清单）用 `typeof` 守卫降级，不再像旧版在 install 崩。
  - 注：旧 `bin/build.sh` 写的 `variable/SERVICE_WORK_VERSION.ts` 是死代码（无人 import），
    真正版本化靠 BUILD_ID；后续可清理。
- **浏览器实测**：首页空闲预取 5 个 en 文件（含 65MB onnx）；开 Walden(none/en) 无点击自动出进度、
  模型走缓存秒开、跑完未超规则返回 null 静默保留规则结果；build 注入 BUILD_ID 正确、模型不进 precache 清单。

### 5.2 规划（按序实施，性价比降序）

1. ✅ **worker 分批推理 + 推理进度**（2026-07-19，`workers/nlpWorker.ts`）：单次大 batch 改按
   `CLASSIFY_BATCH_SIZE=64` 循环前向，每批 `postMessage` `status:'classifying'` 进度 0-100；
   进度经 `classifyLines({onProgress})` → `detectChaptersWithModel` → `enhanceChaptersWithModel`
   透传回 UI。阅读页加 `enhancePhase` 信号，文案随 status 从「下载模型 X%」切「识别中 X%」。
   分批 padding 按本批最长（降峰值张量），attention_mask 屏蔽 padding 不影响每行 logits。
   浏览器实测：Walden(none/en) 自动增强文案「下载100%」→「识别中」→「识别中 42%」逐步推进、跑完清空、无报错。
   **注**：WASM 首批仍有 warmup（~秒级 0%），大书总时长仍偏长——真正提速要 WebGPU / 更小骨干 / int4，属体积线。
2. **enhance 复用规则层已算结果**：`enhanceChaptersWithModel` 现重复 `arrayBufferToString`+
   `detectLanguage`+内部 `collectCandidates`，而 `resolveBookChapters` 打开书时已算过（lang 已入缓存）。
   把 text/lang/规则候选透传进来，去掉三处重复（大书增强明显更快）。**需把 text 从 resolve 侧线程化到
   enhance/transformText，属中等重构。**
3. **成功判据改「比质量」+ 失败反馈**：
   - ✅ 失败反馈（2026-07-19）：`runEnhance(auto)` 区分自动/手动；手动无改善弹短暂提示
     `enhanceNoMore`（4s 自动消失），自动路径保持静默。i18n 三语齐。
   - ⬜ 成功判据改「比质量」：现仍 `chapters.length<=ruleChapters.length` 比数量（规则误报多、
     模型正确少时会误弃更优结果）。待改为覆盖度 + 间距均匀度 + 章节数合理性打分，并提供「回退规则」出口。
4. **模型无编号家族的结构层过滤**（`lib/chapter/validate.ts`）：model 家族现只过 gap + minCount3、
   无 LIS/contiguity，precision~0.34 的假阳性几乎不被挡。加位置均匀性/间距方差离群剔除，或按语言提阈值
   （zh 0.6–0.7、en 0.5；`threshold` 已可配但 UI 未传）。
5. **健壮性**：`canEnhance` 依赖旧缓存 `lang`（缺失→永假）改为 lang 缺失时按 text 现算；
   `TERMINAL_PUNCT` 三处（modelDetect/features/textfeat.py）收敛单一来源；页面卸载 dispose worker。
6. **目录手动编辑 UI**（承 Phase 4）：source:manual 增量标注飞轮，也是裸口语短语标题模型能力边界的兜底。

## 里程碑与顺序

| 阶段        | 依赖                | 独立价值                      |
| ----------- | ------------------- | ----------------------------- |
| P1 规则层   | 无                  | 可直接上线，覆盖 ~95% 常规书  |
| P2 推理设施 | 无（与 P1 并行）    | 链路验证，为任意 NLP 能力铺路 |
| P3 训练管线 | P1 的 bad case 积累 | 产出模型文件                  |
| P4 集成     | P1+P2+P3            | 完整体验 + 数据飞轮           |

**P3 的启动前提是 P1 上线后攒到足量真实 bad case**——如果规则层实际准确率已满足需求，
P3/P4 的模型部分可以推迟或取消，P2 的基础设施投入依然保值。

## 风险登记

1. **iOS 内存**（高）：280MB 模型 + ORT 运行时峰值可能触顶。缓解：移动端用 pruned 版 +
   真机压测；最坏情况移动端仅规则层。
2. **训练数据同义反复**（高）：epub 自动标签只覆盖规则可解样本。缓解：bad case 人工标注
   作为硬性启动条件；用户修正数据回流。
3. **WebGPU 兼容长尾**（中）：旧设备回退 WASM 后推理变慢。缓解：懒加载 + 规则层先出结果，
   模型结果异步刷新目录。
4. **模型托管成本**（低）：280MB × 用户量的 CDN 流量。缓解：懒加载天然限流；HF Hub 免费托管起步。
