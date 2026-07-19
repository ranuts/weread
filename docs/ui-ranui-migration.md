# UI 层重构：去 React + Tailwind，改用 ranui 设计系统（builder + signal），保留 SSG

> 进行中的迁移。原始规划见 Claude plan 文件；本文是仓库内的**权威进度追踪**，随实施更新。

## 背景与目标

weread 是隐私优先的纯前端阅读器（原 React 19 + Vite + Tailwind + PWA，MPA 整页导航，SSG 预渲染，IndexedDB/ML 都在 Worker）。目标：

- **去掉 React 和 Tailwind**，UI 层改用 **ranui 的 `builder`（链式 DOM 构建）+ `signal`（Solid 式响应式）**。
- **用 ranui 的 Geist 设计系统重新设计**（不是 1:1 照搬，重做视觉与组件）。
- **保留 SSG**（改用 ranui SSR：`.serialize()` + `renderHTMLToString` 出 Declarative Shadow DOM）。
- **导航维持 MPA**（`window.location.href` 整页跳转，不引入 r-router）。

**不变量（只换表现层，行为/数据层原样保留）**：`store/*`、`lib/subscribe.ts` 信号、章节识别与 AI 增强（`lib/chapter/*`、`lib/nlp/*`、`store/chapters.ts`）、两个 Worker（`workers/dbWorker.ts`、`workers/nlpWorker.ts`）、`lib/transformText.ts`、i18n（`locales/index.ts` 的 `t()`）、View Transitions 共享元素 morph、`/weread/` 各处字面量、`id = MD5(content)`、Worker 的 `item-id/item-index/title` 委托点击契约。

## 关键技术决策

1. **渲染**：ranui `builder`（`View(tag)`/`Div()` 链式，`.build()`→DOM、`.serialize()`→SSR 串）+ `signal`/`createEffect`/`createRoot`。无 JSX。
2. **路由**：MPA，`router/index.ts` 只留 `base`、`ROUTE_PATH`、`resolveRoute(pathname)`。
3. **设计系统**：`import 'ranui/style'`（Geist token）；旧语义变量重映射到 `--ran-color-*`；真正的亮/暗主题（`initTheme` + `r-theme-switch`）。
4. **状态桥**：`lib/reactive.ts` 的 `fromStore()` 把 store 事件桥成 ranui signal，喂给 builder 单值绑定；删掉 React 的 `useState` 计数器重渲染。
5. **SSG**：`views/server.ts` 用 `.serialize()`+`renderHTMLToString()`；`bin/build-ssg.js` 改为 **client 只构建一次**再循环 `render(url)`。
6. **图标**：`registerBuiltinIcons` 来自 **`ranui/icons`**（复数，非 `ranui/icon`），server + client 都要调。
7. **验证网关**：`pnpm tsc`/`pnpm lint` 因 TS7 全仓坏；改用 `pnpm build`（esbuild 转译即事实类型门）+ `pnpm test`（vitest 数据层）+ chrome-devtools 浏览器走查。

## 进度总览

| 阶段 | 内容 | 状态 |
|---|---|---|
| Phase 0 | SSR 冒烟：验证 builder→DSD 往返 | ✅ 完成 |
| Phase 1 | 基建 + 入口骨架 + Loading 打通 | ✅ 完成（已浏览器验证；`pnpm test` 待补） |
| Phase 2 | 叶子组件（Popover/BookCard/Catalogue/DetailMenu/DetailOperate） | ✅ 完成（build 证毕；运行时走查随 P3/P4 接线补） |
| Phase 3 | home 页重设计 + 响应式合并 | ⬜ 未开始 |
| Phase 4 | book-detail 页（含 AI 增强） | ⬜ 未开始 |
| Phase 5 | 清理依赖/死代码，终版 build + 走查 | ⬜ 未开始 |

## Phase 0 — SSR 可行性 ✅

一次性脚本验证：SSR 环境 `isSSR` 为真；builder `.serialize()` 出裸 `<r-*>` 标签；`renderHTMLToString()` 内联 `<template shadowrootmode="closed">`（DSD）。**结论：ranui SSG 路线成立。** 注脚：`r-icon` 的 SSR shadow 为空（图标客户端渲染），因客户端整树重建无影响。

## Phase 1 — 基建 + 骨架 ✅

**新建**：`lib/reactive.ts`（`fromStore`）、`styles/weread-utilities.css`、`router/index.ts`、`app.ts`（`mountApp`）、`views/server.ts`、`views/client.ts`、`components/Loading/index.ts`、`pages/home/index.ts`（占位桩）、`pages/book-detail/index.ts`（占位桩）。

**改写**：`vite.config.ts`（删 react 插件 + noExternal，修正 alias）、`postcss.config.ts`（去 tailwind）、`styles/base.css`（`ranui/style` 替代 tailwind）、`styles/theme.scss`（重映射 `--ran-color-*`）、`lib/hooks.ts`（`useCheckDevice`→`watchDevice`）、`views/index.html` + `index.html`（脚本指 `.ts`，去 tailwind class）、`bin/build-ssg.js`（client 只构一次 + 循环 render）、`typings.d.ts`、`package.json`（`build:server` 指 `.ts`）。

**删除**：`app.tsx`、`index.tsx`、`router/index.tsx`、`views/{server,client}.tsx`、`components/Loading/index.tsx`、`pages/*/index.tsx`。

**验证证据**：`pnpm build` 成功（SSR 2.5kB / client 370kB·gzip 104kB / CSS 11.7kB / Geist 字体已打包）；三路由 `render()` 均出 DSD 外壳；`dist/{index,book-detail/index}.html` 外壳注入完整、无残留 outlet、SW 缓存清单注入、`models/` 拷贝、scratch 目录清理。浏览器实测 `/weread/`：`#app` 首元素 `R-SECTION`、heading/文案正确、**无 console 报错**、DSD 无残留 template、`pwa-install` 挂载、`--ran-color-bg` token 生效。

**待补**：`pnpm test`（数据层回归）。

## Phase 2 — 叶子组件 ✅

5 个 `.tsx`→`.ts`（原实现仍在 git 历史可参考），builder 重做 + Geist 视觉，保留行为契约。**函数式 `render*(...)` 返回 `ElementBuilder`**，全部要求在 `createRoot` 作用域内调用（signal 绑定 / `onCleanup` 才有 owner）：

- [x] `Popover`（`renderPopover`）：`<r-popover>`+`<r-content>`（后者由 `import 'ranui/popover'` 自带，**不要**单独 `import 'ranui/content'`——该子路径 rolldown 解析失败）。`syncHook.tap(CLOSE_POPOVER)` + `onCleanup` 解绑，命令式 `closePopover()` 经 `createRef` 调组件实例方法。
- [x] `BookCard`（`renderBookCard(book)`）：外层 `<a>`（href/morph/click）内嵌 `<r-card hoverable>`。`view-transition-name: book-info-${id}` + `startViewTransition` + `/weread/book-detail?id=` 整页跳转 + `clear()` 三信号 `batch()` 重置。**新增 `e.preventDefault()`**：否则 `<a>` 默认导航抢占，morph 不生效（原 React 版缺此，实为契约的正确实现）。响应式尺寸交给 CSS（P3 合并 desktop/mobile 的落点）。
- [x] `Catalogue`（`renderCatalogue`）：`fromStore` 桥接 `SET_TEXT_SYNTAX_TREE`/`SET_CURRENT_BOOK_DETAIL`；章节列表用 **`Index`**（按位置 keyed，item 是 signal，随语法树就地更新）；`toPage` 委托点击读 `title` 属性；排序方向 signal 绑定图标 `.class()` 旋转（`createRef`/`scrollRef` 仅留给 toSort 的命令式滚动）。
- [x] `DetailMenu`（`renderBookDetailMenu`）：`<r-input>` 原生 `change`（防抖 500ms）；`showSearchResult` signal 用 `.style('display', getter)` 切换目录/结果（目录常驻构建以保留其滚动/响应式，仅显隐切换）；结果用 **`Show`**（空/非空）+ **`For`**（按分组 `index` keyed）+ `item-index` 委托跳页；空态 `r-icon`。
- [x] `DetailOperate`（`renderBookDetailOperate` / `renderMobileBookDetailOperate`）：Popover + menu 图标薄封装，overlay 传 `renderBookDetailMenu()`。

**样式落点**：不在组件 `.ts` 内 `import scss`（保持纯逻辑 / SSR·esbuild 安全），集中于新建 `styles/weread-components.css`，由 `styles/base.css` `@import`（仅 client 侧引入，server 只序列化结构无需样式）。含补齐的 `.hover-icon`（原 Tailwind 无定义）。

**builder 反应式（已随 ranui `0.2.1-alpha.3` 升级，摩擦点已在上游修掉）**：迁移中把踩到的坑反馈进了 ranui（改在 `~/Documents/code/ran`），现 `.children()` 除静态节点外还接：**getter**（粗粒度整块重建，兜底）、**`Show`/`Switch`**（细粒度条件，仅真假翻转时重建）、**`For`/`Index`**（keyed 列表，复用节点）。单值仍用 `.text/.attr/.class/.style(getter)`。原则:值→getter 绑定;条件→`Show`;列表→`For`(按 id)/`Index`(按位置);getter 仅兜底——**不要**再手写 `createEffect`+`createRef`+`replaceChildren` 那套（`createRef` 只留给命令式 DOM 操作，如目录排序滚动）。

**alpha.3 落地重构**：`Catalogue` 章节列表 `createEffect`+`replaceChildren` → **`Index`**；`DetailMenu` 搜索结果 `createEffect`+`resultRef` → **`Show`+`For`**。两处删掉「首帧 el 未 build 早退」样板。

**验证证据**：因页面仍是骨架、组件尚未进构建图，临时在 `views/client.ts` 加探针 `import` 全部 5 组件跑 `pnpm build:client`（真实 vite + alias + ranui 子路径解析）→ 通过后移除探针。终版 `pnpm build` 全绿（server 2.5kB / client 375kB·gzip 105.5kB / CSS 14.98kB / SSG 三页外壳仍完整）。**运行时浏览器走查随 P3（BookCard 进 home）/ P4（Operate·Menu·Catalogue·Popover 进 book-detail）接线时一并做。**

## Phase 3 — home 页重设计 ⬜

- [ ] `<r-input>` 搜索（防抖 500ms，三路并行 worker 搜索）+ 面板高度 signal 绑定 `.style('height', …)`
- [ ] `<r-card>` 书架栅格 + "+" 导入（`createElement('input')`→`checkEncoding`→`addBook`）
- [ ] 默认 8 本书 seeding、`item-id` 委托导航
- [ ] Desktop/Mobile 合并为单份响应式（`watchDevice()` + CSS 断点）
- [ ] 新增 `<r-theme-switch>`

## Phase 4 — book-detail 页（最难）⬜

- [ ] 加载链：`getBookById`→`resolveBookChapters`→`transformTextToExpectedFormat(container=ref)`→`setTextSyntaxTree/setPageNum`
- [ ] 翻页用 `fromStore` 信号只更新标题+两列正文；`pre/next` 包 `startViewTransition`
- [ ] 移动端触控翻页 + 上下 chrome 栏（signal 绑定高度）
- [ ] AI 增强：`canEnhance/enhanceProgress` 信号 → `<r-progress>` + `<r-loading>` 检测态；`enhanceChaptersWithModel` 原样调用
- [ ] `toHome` 共享元素 morph

## Phase 5 — 清理 ⬜

- [ ] `package.json` 删 react/react-dom/react-router-dom、@vitejs/plugin-react、tailwindcss/@tailwindcss/*、autoprefixer、postcss、@types/react*
- [ ] client 端组件/图标按子路径 import 精简包体
- [ ] 终版 `pnpm build` + `pnpm test` + 全量浏览器走查（增删书/搜索/翻页/目录/AI 增强/返回 morph）

## 风险与注意

1. `shadowrootmode="closed"`：客户端 `element.shadowRoot` 恒 `null`（正常闭合影子），不影响功能。
2. 原 5 个组件 `.tsx` 仍在（未进构建图不编译），Phase 2 转 `.ts` 时删除。
3. 契约不回归：r-input 原生 `change/input`、`item-id/item-index/title` 委托、`view-transition-name` morph、`/weread/` 字面量（BookCard href / manifest-url / SW scope / `/weread/models/`）、SW 缓存清单注入顺序、Worker `new URL('../workers/*.ts', import.meta.url)`。
4. 客户端 hydration 采用 light-DOM 重建（`replaceChildren`）：外壳静态、数据客户端从 IndexedDB 加载，最简且正确。
