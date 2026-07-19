# weread 视觉重设计 & 交互升级 — 规划

> 分支：`feat/txt-chapter-detection`
> 目标：把 weread 从"能用但通用"做到 **Vercel/Geist 质感的产品级**——设计系统统一（ranui Geist token）、交互到位（边打边搜、键盘流、快捷键）、亮暗双主题实证。
> 设计基准：[ranui `docs/DESIGN.md`](../../../Documents/code/ran/packages/ranui/docs/DESIGN.md)（Geist）+ survival 仓库 `skills/web-craft`。
> 制定日期：2026-07-19
>
> **方法论铁律**（web-craft）：设计系统先行（只用 `--ran-*` 语义 token，不写死 hex）；动效克制且带 reduced-motion 兜底；**任何视觉/交互改动必须真实浏览器亮暗双主题各截图验证**。

---

## 一、进度总览

| 模块 | 状态 | 说明 |
|---|---|---|
| 封面系统重设计 | ✅ 已交付 | 随机满饱和 HSL 渐变 → 8 色精选编辑感双色板 + 衬线标题 + 内描边书框；亮暗验证 |
| 阅读正文衬线 | ✅ 已交付 | `--wr-serif`（Latin+CJK）用于双列/移动正文，CJK 落 Songti，"印刷书"质感 |
| 书架入场动效 | ✅ 已交付 | CSS-only fade-up 错峰，`prefers-reduced-motion` 兜底 |
| 边打边搜（首页 + 书内） | ✅ 已交付 | `change`→`input`，250ms 防抖；实测无回车即出结果 |
| Esc 清空搜索 | ✅ 已交付 | 清输入 + 复位搜索态，露出书架 |
| 阅读键盘翻页 | ✅ 已交付 | ←/→、Space、PageUp/Down（Shift+Space 回退），输入聚焦时不拦截，onCleanup 解绑 |
| 桌面阅读位置指示 | ✅ 已交付 | `当前页 / 总页`，tabular-nums，与移动端对齐 |
| **r-input focus 能力** | ✅ 已交付（ranui 源码） | 组件补 `focus()`/`blur()`/`select()`，见 §四 |
| **`/` 聚焦搜索 + 全选** | ✅ 已交付 | 依赖上条；本地已 patch 验证通过，正式生效需 ranui 发版 + 升级（见 §四） |
| **Vercel 质感深修** | 🚧 进行中 | 见 §二 |
| 目录高亮当前章节 | ✅ 已交付 | 当前章左侧墨色竖条 + 提亮，浮层打开/翻页自动滚入视口（IntersectionObserver）；见 §三-1 |
| 搜索结果键盘导航 | ✅ 已交付 | 首页 + 书内搜索均支持 ↑/↓ 移高亮、Enter 打开/跳页；见 §三-2 |
| 大书分页性能 | ✅ 已交付 | 分页算法 5× 提速（910K 字 17ms）+ 撤掉挂起的分页 Worker，大书秒开；见 §三-3 |
| 章节识别改纯模型无感 | ✅ 已交付 | 弃规则、纯模型 + 页面加载预取 + 目录 loading + SW 缓存；见 §三-4 / journey §12 |

---

## 二、Vercel 质感深修（本轮执行）

现状：外壳干净但偏"平"——顶栏松散、区块无 hairline 焊接、留白空、焦点态缺失。目标是补上 Geist 产品的"结构感"。

0. **主色调 → Vercel 黑白单色**（已提升到 ranui 组件库层，全站默认基调）：见 §六。weread 侧因此**移除了本地 primary 覆盖**，徽标改用 `--ran-color-primary` + `--ran-color-primary-text`，焦点描边改用 `--ran-color-link`（保持蓝）。
1. **粘性 Geist 顶栏**：`.wr-home-header` → 全宽 sticky bar（`backdrop-filter: blur(12px)` 单薄条 + 底部 1px hairline + `--ran-color-bg` 半透），内容对齐 72rem 容器。是"产品感"最大的信号。
2. **hairline 焊接 + 节奏收紧**：区块间距走 `--ran-space-*`（section 32–40px），书架头加 hairline，压掉搜索→书架之间的空旷。
3. **焦点可达性（Geist 焦点环）**：书卡 / 导入卡 / 交互元素统一 `:focus-visible` → `--ran-focus-ring`（或 `outline: 2px var(--ran-color-primary); offset 2px`）。键盘可达 + 观感都升级。
4. **搜索 `/` 提示芯片**：输入框右侧 `<kbd>/</kbd>` 提示，呼应 `/` 快捷键（Vercel/GitHub 味）；配 focus 环。
5. **阅读页 chrome 精修**：顶栏 hairline + 导航按钮焦点环，和首页统一。

> 约束：动效只过渡 `transform/opacity`，不过渡调色板属性（避免换肤淡变）；大 blur 只用于单一薄条，不压暗色正文。

---

## 三、后续路线（已排期，未开工）

### 1. 目录高亮当前章节
- **痛点**：目录（Catalogue）里看不出"我读到哪一章"。
- **方案**：`renderCatalogue` 订阅 `pageNum`/`tree`，按 `pageTitleId[pageNum]` 求当前章节 index，给对应 `.wr-catalogue-item` 加 `.is-active`（左侧 `--ran-color-primary` 竖条 + 主文本色 + `bg-hover` 底）。打开目录时 `scrollIntoView` 到当前章。
- **验证**：翻到中段开目录，当前章高亮且在视口内。

### 2. 搜索结果键盘导航
- **痛点**：边打边搜后只能鼠标点结果。
- **方案**：首页搜索面板加 roving `↑/↓` 选中（`aria-activedescendant` + `.is-highlighted`），`Enter` 打开高亮项、无高亮时打开第一条，`Esc` 已接管清空。书内搜索同理跳页。
- **注意**：与全局 `onKey` 协作——输入聚焦时 `↑↓/Enter` 归搜索面板，不触发翻页。

### 3. 大书分页性能（✅ 已交付，结论与初判不同）
- **真因**：以为是分页卡主线程，实测后发现分页根本不慢——真凶是「分页 Worker 挂起」（首版 worker 不 postMessage 回来、无超时兜底 → loading 永挂）+ **模型自动增强**（英文书 `confidence:none` 触发下 67MB 模型）。分页算法本身：优化后**910K 字 → 17ms**（《三国》1916 页 / Walden 1443 页 **秒开**）。
- **做法**：① 分页算法优化——`charCode` 查表替每字符正则、`text.slice` 一次切页替逐字符 `+=` 拼串，**约 5×**（90ms→17ms），纯核心 `lib/paging.ts`（`pagingTextCore` / `buildTextSyntaxTree`），语法树 3/3 测试逐字节不变。② **撤掉分页 Worker**（over-engineering + 有挂起 bug；17ms 单帧同步即可，无冻结、无 loading）。③ 章节识别改纯模型异步（见下），reader 立即可读、目录显 loading。
- **验证**：《三国》1916 页、Walden 1443 页均秒开，主线程全程可交互（截图/求值不再超时）。

### 4. 章节识别改「纯模型 + 无感自动」（✅ 已交付，见 chapter-detection-journey §12）
- **要求**：弃规则匹配（打地鼠、54% 覆盖，见 journey §3）；只用模型，且对用户无感——页面加载即后台预取模型 + SW 缓存，没好就目录显 loading。
- **做法**：`detectChaptersWithModel` 去 union+validate（逐行过阈值直接成章）；`resolveBookChapters` 缓存/caption/pending 三态、不跑规则；reader model-first（pending → 模型识别，整本一章可读 + 目录 loading）；打开页面即 `prefetchModelsForLangs([uiLang()])`；**任何已缓存结果直接复用**（不迁移丢弃——否则结构化大书会强下 103MB 重跑、卡顿），纯模型只作用于无缓存新书。**权衡**：去 validate 后模型假阳性直进目录（用户接受，靠 per-lang 模型精度 + 手动编辑兜底）。
- **验证**：清缓存开 Walden → 整本一章立即可读 → 目录「Detecting」→ 模型出「1854/WALDEN/ECONOMY/SOLITUDE」、reader 重排、当前章高亮、缓存 model 重开不跑。

---

## 四、r-input focus 能力（ranui 组件库）

- **问题**：`<r-input>` 是 **closed shadow** 且宿主无 `focus()`/未开 `delegatesFocus`——页面 JS 无法聚焦内部输入框（`host.focus()`/`host.click()`/`host.shadowRoot` 全无效），导致 `/`-to-focus 这类快捷键在业务层做不了。
- **修复**（源码 `~/Documents/code/ran/packages/ranui/components/input/index.ts`）：给 `Input` 类补 `focus(options?)` / `blur()` / `select()`，转发到内部 `_inputContent`。已加契约测试（34/34 通过）、`tsc` 通过、`npm run build` 通过、`doc:api` 重生成、CHANGELOG 记账。ranui 自身 demo 实测 `el.focus()` 使 `activeElement` BODY→R-INPUT。
- **落到 weread**：weread 用 npm 版 `ranui@0.2.1-alpha.4`（非 workspace link），**正式生效需 ranui 发新版 + weread 升级**。本地已把重建的 `input` chunk patch 进 `node_modules` 验证 `/` 可用（`pnpm install` 会覆盖，属临时验证）。
- 经验已沉淀到 survival 记忆 `ranui-input-behavior`。

---

## 六、ranui 主色调改单色（组件库层，2026-07-19）

把「Vercel 黑白主色」从项目覆盖上升为 **ranui 默认基调**（源码 `~/Documents/code/ran/packages/ranui`）：

- `--ran-color-primary/-hover/-active` 直接映射单色（gray-1000 + `#383838`/`#4d4d4d`，暗色 `#cccccc`/`#b3b3b3`），新增 **`--ran-color-primary-text`**（= background-100，ON-primary 反色墨，随主题翻转——单色 primary 上的文字/图标必须用它）。
- `--ran-color-link` 保持 geist-blue；`--ran-focus-ring` 从 primary 解耦、钉到 blue-700 → **链接与焦点保持蓝**。
- **移除** 冗余的 `--ran-color-contrast-*` 与 `r-button type="contrast"`（primary 现在本身即单色动作，默认 `type="primary"` 按钮就是黑白）。button 的 primary 文案/涟漪/hover 改用 `--ran-color-primary-text`。
- 配套：DESIGN.md 教义更新、`doc:style`/`doc:api` 重生成、CHANGELOG 记账（标 breaking, pre-release）、契约测试更新，`test:unit` 1131 passed、`tsc` 通过、`build` 通过。ranui demo 亮暗双验证：primary 按钮黑白且文字翻转、链接/焦点蓝。
- **e2e 快照待更新**：primary 按钮由蓝变黑，`test/e2e/*button*` 等快照需 `npm run test:update` 重生成（未在本环境跑）。
- **落到 weread**：需 ranui 发版（alpha.6+）+ weread 升级。当前为验证已把重建 dist 临时 patch 进 weread 的 `node_modules`（`pnpm install` 会覆盖）——发版后即为正式。

## 五、验证协议（Definition of Done）

每项改动必须：① 真实浏览器驱动；② 亮 + 暗各截一张，肉眼确认可读/无糊屏/动效正常；③ 键盘态 + focus 环验证；④ `tsc` 无新增错误（weread 基线 18 个为既有 Vite `?url`/大小写/环境类型问题）。
