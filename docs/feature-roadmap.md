# weread 功能路线图

> 私人、离线优先的 TXT 阅读器（PWA）。本文记录**可增加的功能**及优先级，配合已完成的视觉/交互重构（见 [redesign-plan.md](./redesign-plan.md)）与章节识别（见 [chapter-detection-journey.md](./chapter-detection-journey.md)）。
> 制定日期：2026-07-19
>
> **现状盘点**：阅读进度**未持久化**（`pageNum` 只是内存信号，进书重置为 0，不续读）；`BookInfo` 元数据薄（id/title/author/image/content/encoding/时间戳，无阅读状态/标签/进度/笔记）；导入实质**只支持 txt**。

## 优先级总表

| # | 功能 | 优先级 | 状态 | 一句话 |
|---|---|---|---|---|
| 1 | **阅读进度持久化 + 续读** | P0 | ✅ 已交付 | 按 book id 存进度到 `books_progress`(DB v3)，开书续读；书架封面底部蓝色进度条 |
| 2 | 阅读设置（字号/行距/边距/阅读主题/正文字体） | P0 | ✅ 已交付 | 「Aa」浮层调字号/行距/边距/主题/字体，即时重排并保位置 |
| 3 | 书签 / 划线 / 笔记 | P0 | ⬜ | 选中划线 + 想法 + 笔记面板 |
| 4 | 元数据编辑 + 封面上传 | P1 | ⬜ | 改书名/作者、传自定义封面 |
| 5 | 阅读状态 / 标签 / 排序 / 分组 | P1 | ⬜ | 在读/读完/未读、最近置顶、书单 |
| 6 | 更多导入格式（epub/pdf/mobi） | P1 | ⬜ | epub 自带 toc.ncx = 权威目录，连模型都省了 |
| 7 | TTS 朗读 | P1 | ⬜ | Web Speech API 读正文，翻页联动 |
| 8 | 书库备份 / 导出 / 导入 | P2 | ⬜ | 离线优先 → 本地导出文件；进阶 WebDAV 自建同步 |
| 9 | PWA 深度集成（file_handlers / share_target） | P2 | ⬜ | 系统里双击 .txt 用 weread 打开 / 分享导入 |
| 10 | 搜索增强（跨书全文 / 历史） | P2 | ⬜ | 现有：单书内搜索 + 书架标题/作者/内容搜索 |

## 明细

### 1. 阅读进度持久化 + 续读（P0，✅ 已交付）
- **痛点**：`pageNum` 是 `lib/subscribe.ts` 的内存信号，`BookCard.clear()` 进书前置 0 → 每次从头看，不续读。
- **实现**：新建轻量 store `books_progress`（DB v2→v3；单独 store 避免翻页重写 `books_info` 的整本 content 大 blob），存 `{ id, page, totalPage, percent, updatedAt }`（`store/progress.ts`）。reader：`paginateToTree` 出树后 `getProgress` 恢复上次页码（`restorePage` 同分页精确、异分页按比例缩放 + 夹取）；`createEffect` 订阅 `pageNum`/`totalPage`、防抖 700ms `saveProgress`（`progressRestored` 门控，避免初始 0 覆盖）。书架：`getAllProgress` 一次性拉、`renderBookCard` 传响应式 `getPercent` getter → 封面底部蓝色进度条（`.wr-cover-progress`）。删书级联清进度（`deleteBook`）。
- **已验证**：《三国》翻到第 6 页离开重进 → 回到第 7/1916 页；书架《三国》封面显 45% 蓝条，未读书无条。

### 2. 阅读设置（P0，✅ 已交付）
- **实现**：新 store `store/settings.ts`（localStorage + ranuts 响应式信号 `SET_READING_SETTINGS`），字段 `{ fontScale, lineScale, margin, theme, font }`（字号/行距倍率、页边距档、阅读主题、正文字体）。
- **分页/显示同步（关键）**：`pagingTextCore` 加 `typography{fontScale,lineScale}` 参数，基准常量 × 倍率——**scale=1 与原硬编码逐位相同（零回归，46 测试含 9 条新用例守护）**；显示侧 `.wr-reader-columns`/`.wr-reader-mobile-text` 用 `calc(… × var(--wr-font-scale/--wr-line-scale))` 同倍率驱动，两侧一致不错位。透传链 `transformTextToExpectedFormat → buildTextSyntaxTree → pagingTextCore`。
- **边距**：`--wr-margin-scale`（窄 0.5/标准 1/宽 1.6）缩放 `.wr-reader-book` 左右内边距 → 容器 clientWidth 变 → 分页自动重算每行字数。
- **主题**：`.wr-theme-sepia`/`.wr-theme-oled` 局部覆盖 ran 语义色 token（阅读页根 class，'system' 跟随应用亮/暗）。**字体**：`--wr-body-font` 切 `--wr-serif`/`--wr-sans`（新增无衬线栈）。
- **UX**：桌面右上 / 移动底栏加「Aa」浮层（`components/ReadingSettings` + `DetailOperate`）——字号/行距步进、边距/主题/字体分段选择、恢复默认。改设置 → 落 CSS + 按同章节 + 新倍率重排 + **按百分比映射保住阅读位置**（`onSettingsChange`）。首帧即按已存设置渲染。

### 3. 书签 / 划线 / 笔记（P0）
- 选中正文 → 划线/高亮，附想法；单独「笔记」面板按书聚合。存 `books_notes` store，锚点用字符偏移（`pageText[i].start/end`）。

### 4. 元数据编辑 + 封面上传（P1）
- 改 `BookInfo` 的 title/author/image；封面上传（现为哈希生成式封面）。详情页或书架长按/菜单入口。

### 5. 阅读状态 / 标签 / 排序 / 分组（P1）
- `BookInfo` 加 `status`（unread/reading/finished，可由进度自动推断）、`tags[]`；书架排序（时间/书名/最近读）、按标签/书单分组、最近阅读置顶。

### 6. 更多导入格式（P1）
- epub：解析 `toc.ncx`/`nav.xhtml` 直接拿权威目录（免模型识别）+ spine 拍平正文；pdf（pdf.js 抽文本）；mobi。扩 `createReader`/`transformText`。

### 7. TTS 朗读（P1）
- `speechSynthesis` 读当前页/章，翻页联动、可选自动翻页；语速/音色设置。

### 8. 书库备份 / 导出 / 导入（P2）
- 离线优先：导出书 + 进度 + 笔记为单文件（zip/json），换设备导回。进阶：可选 WebDAV / 自建端同步（保持"私人"定位，不强绑云）。

### 9. PWA 深度集成（P2）
- `manifest.file_handlers`（关联 .txt/.epub，系统里打开即导入）、`share_target`（从系统分享导入文本/文件）。

### 10. 搜索增强（P2）
- 现有：书内搜索（↑/↓/Enter 跳页）+ 书架标题/作者/内容三路搜索。可加：跨书全文搜索、搜索历史、结果高亮跳转。
