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
| 目录高亮当前章节 | ⬜ 规划 | 见 §三-1 |
| 搜索结果键盘导航 | ⬜ 规划 | 见 §三-2 |
| 大书分页移出主线程 | ⬜ 规划（性能） | 见 §三-3 |

---

## 二、Vercel 质感深修（本轮执行）

现状：外壳干净但偏"平"——顶栏松散、区块无 hairline 焊接、留白空、焦点态缺失。目标是补上 Geist 产品的"结构感"。

0. **主色调 → Vercel 黑白单色**（全站默认基调）：把 `--ran-color-primary` 一族在 `styles/theme.scss` 重指向 ranui **contrast** token（亮=近黑、暗=近白，自翻转），去掉蓝强调色；徽标/焦点环/链接/loading 统一墨色。对齐 ran.chaxus.com / edit.chaxus.com。
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

### 3. 大书分页移出主线程（性能）
- **痛点**：`transformTextToExpectedFormat` 对整本书同步分页，大书（如《三国》《国富论》）会**卡死主线程数秒**（实测 devtools 下截图/求值都超时）。
- **方案**：分页测量搬进 Worker 或 `requestIdleCallback` 分片；先出首屏两页、其余增量补算；加载态用骨架/进度。测量依赖真实 `clientWidth/Height`，需把量取的尺寸传给 worker（worker 无 DOM），或用 `OffscreenCanvas`/预估字符宽度做近似分页再回填。
- **验证**：打开《国富论》，首屏 < 1s 可读且可翻页，主线程不长时间阻塞。

---

## 四、r-input focus 能力（ranui 组件库）

- **问题**：`<r-input>` 是 **closed shadow** 且宿主无 `focus()`/未开 `delegatesFocus`——页面 JS 无法聚焦内部输入框（`host.focus()`/`host.click()`/`host.shadowRoot` 全无效），导致 `/`-to-focus 这类快捷键在业务层做不了。
- **修复**（源码 `~/Documents/code/ran/packages/ranui/components/input/index.ts`）：给 `Input` 类补 `focus(options?)` / `blur()` / `select()`，转发到内部 `_inputContent`。已加契约测试（34/34 通过）、`tsc` 通过、`npm run build` 通过、`doc:api` 重生成、CHANGELOG 记账。ranui 自身 demo 实测 `el.focus()` 使 `activeElement` BODY→R-INPUT。
- **落到 weread**：weread 用 npm 版 `ranui@0.2.1-alpha.4`（非 workspace link），**正式生效需 ranui 发新版 + weread 升级**。本地已把重建的 `input` chunk patch 进 `node_modules` 验证 `/` 可用（`pnpm install` 会覆盖，属临时验证）。
- 经验已沉淀到 survival 记忆 `ranui-input-behavior`。

---

## 五、验证协议（Definition of Done）

每项改动必须：① 真实浏览器驱动；② 亮 + 暗各截一张，肉眼确认可读/无糊屏/动效正常；③ 键盘态 + focus 环验证；④ `tsc` 无新增错误（weread 基线 18 个为既有 Vite `?url`/大小写/环境类型问题）。
