# TXT 章节识别与标题提取 — 实施计划

> 分支：`feat/txt-chapter-detection`
> 目标：对用户导入的任意格式 txt，自动识别章节边界并提取标题。
> 架构：三层规则流水线为基座，mDeBERTa-v3-base（浏览器端 ONNX 推理）作为候选生成的增强层。
> 制定日期：2026-07-16

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

## Phase 3 — 训练管线（仓库外 Python，产物回流）

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
- ⬜ 模型增强接线：low/none 置信度时提示用户下载模型增强解析（依赖 P3 真模型）
- ⬜ 目录手动编辑 UI：用户可增删改章节点；**用户修正即标注数据**（source: manual），
  本地留存，（可选、需用户同意）匿名回传作为下一轮训练语料
- ⬜ i18n：新增文案走 `locales/`

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
