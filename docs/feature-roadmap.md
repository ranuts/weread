# weread 功能路线图

> 私人、离线优先的 TXT 阅读器（PWA）。本文记录**可增加的功能**及优先级，配合已完成的视觉/交互重构（见 [redesign-plan.md](./redesign-plan.md)）与章节识别（见 [chapter-detection-journey.md](./chapter-detection-journey.md)）。
> 制定日期：2026-07-19
>
> **现状盘点**：阅读进度**未持久化**（`pageNum` 只是内存信号，进书重置为 0，不续读）；`BookInfo` 元数据薄（id/title/author/image/content/encoding/时间戳，无阅读状态/标签/进度/笔记）；导入实质**只支持 txt**。

## 优先级总表

| # | 功能 | 优先级 | 状态 | 一句话 |
|---|---|---|---|---|
| 1 | **阅读进度持久化 + 续读** | P0 | 🚧 进行中 | 按 book id 存 `pageNum` 到 IndexedDB，开书恢复；书架显进度 |
| 2 | 阅读设置（字号/行距/边距/阅读主题/正文字体） | P0 | ⬜ | 读者停留最久处，现在完全不可调 |
| 3 | 书签 / 划线 / 笔记 | P0 | ⬜ | 选中划线 + 想法 + 笔记面板 |
| 4 | 元数据编辑 + 封面上传 | P1 | ⬜ | 改书名/作者、传自定义封面 |
| 5 | 阅读状态 / 标签 / 排序 / 分组 | P1 | ⬜ | 在读/读完/未读、最近置顶、书单 |
| 6 | 更多导入格式（epub/pdf/mobi） | P1 | ⬜ | epub 自带 toc.ncx = 权威目录，连模型都省了 |
| 7 | TTS 朗读 | P1 | ⬜ | Web Speech API 读正文，翻页联动 |
| 8 | 书库备份 / 导出 / 导入 | P2 | ⬜ | 离线优先 → 本地导出文件；进阶 WebDAV 自建同步 |
| 9 | PWA 深度集成（file_handlers / share_target） | P2 | ⬜ | 系统里双击 .txt 用 weread 打开 / 分享导入 |
| 10 | 搜索增强（跨书全文 / 历史） | P2 | ⬜ | 现有：单书内搜索 + 书架标题/作者/内容搜索 |

## 明细

### 1. 阅读进度持久化 + 续读（P0，本轮开工）
- **痛点**：`pageNum` 是 `lib/subscribe.ts` 的内存信号，`BookCard.clear()` 进书前置 0 → 每次从头看，不续读。
- **方案**：新建轻量 store `books_progress`（不塞进 `books_info`，避免每次翻页重写整本 content 大 blob），存 `{ id, page, totalPage, percent, updatedAt }`。开书 `paginateToTree` 出树后按 id 恢复上次页码（clamp 到 totalPage）；翻页时防抖写入。书架卡片显进度条/百分比（首页一次性 `getAllProgress`）。
- **验证**：翻到中段离开重进，回到原页；书架卡片显进度。

### 2. 阅读设置（P0）
- 字号 / 行距 / 边距 / 阅读主题（护眼 sepia、纯黑 OLED）/ 正文字体（衬线 ↔ 无衬线，现固定 `--wr-serif`）。设置存 localStorage，`--wr-*` / `--ran-*` 变量驱动，翻页/分页参数（`pagingTextCore` 的 fontSize/lineHeight）要随之联动重排。

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
