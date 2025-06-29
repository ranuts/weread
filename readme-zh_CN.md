<p align="center">
  <a href="https://ranuts.github.io/weread/" target="_blank" rel="noopener noreferrer">
    <img width="180" src="https://ranuts.github.io/weread/read.svg" alt="weread logo">
  </a>
</p>

<p align="center">
  <strong>一个以隐私优先的纯净网络阅读器</strong>
</p>

<p align="center">
<a href="https://github.com/ranuts/weread">
    <img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="license">
</a>
<a href="https://github.com/ranuts/weread">
    <img src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat" alt="PRs welcome!" />
</a>
<a href="https://github.com/ranuts/weread"><img src="https://img.shields.io/github/actions/workflow/status/ranuts/weread/ci.yml" alt="Build Status"></a>
<a href="https://github.com/ranuts/weread">
    <img src="https://img.shields.io/github/forks/ranuts/weread" alt="forks">
</a>
<a href="https://github.com/ranuts/weread">
    <img src="https://img.shields.io/github/stars/ranuts/weread" alt="stars">
</a>
</p>

<p align="center">
  <a href="https://ranuts.github.io/weread/" target="_blank">🌐 在线演示</a> • 
  <a href="#功能特性">✨ 功能特性</a> • 
  <a href="#技术栈">🛠️ 技术栈</a> • 
  <a href="#快速开始">🚀 快速开始</a>
</p>

---

**本项目为学习交流专项项目。如发现任何问题，欢迎提交 issue 反馈或发起 PR 改进。本项目仅限学习交流用途，不建议另作他用。**

[English](./readme.md) · 中文

## 📖 关于

> "如无必要，勿增实体" - 奥卡姆剃刀原理

Weread 是一个极简主义、注重隐私的网络阅读器，提供纯净的阅读体验，没有任何不必要的复杂性。采用现代网络技术构建，通过 PWA 功能提供类似原生应用的体验。

## ✨ 功能特性

- 📚 **本地 TXT 支持** - 直接导入和阅读本地 TXT 文件
- 🤖 **AI 章节识别** - 使用 AI 算法智能提取章节结构
- 📱 **PWA 支持** - 可安装为渐进式 Web 应用，支持离线阅读
- 🔒 **隐私优先** - 无服务端处理，所有数据本地存储
- 🌍 **多语言** - 支持中文和英文界面
- 📖 **响应式设计** - 针对桌面端和移动端优化
- 🎨 **现代界面** - 简洁直观的用户界面
- ⚡ **高性能** - 基于 React 构建，性能优化
- 🔄 **智能章节检测** - 结合传统正则表达式和 AI 方法的混合策略
- 📊 **阅读进度** - 自动跟踪阅读进度

## 🛠️ 技术栈

- **前端框架**: React 19 + TypeScript
- **构建工具**: Vite 6
- **样式**: Tailwind CSS 4 + SCSS
- **状态管理**: 自定义 store + IndexedDB
- **路由**: React Router DOM
- **PWA**: Service Worker + Web App Manifest
- **UI 组件**: 自定义组件 + RanUI
- **文本处理**: 自定义文本转换和编码检测
- **包管理器**: pnpm

## 🚀 快速开始

### 环境要求

- Node.js >= 23.10.0
- pnpm（推荐）或 npm

### 安装

1. **克隆仓库**

   ```bash
   git clone https://github.com/ranuts/weread.git
   cd weread
   ```

2. **安装依赖**

   ```bash
   pnpm install
   ```

3. **启动开发服务器**

   ```bash
   pnpm dev
   ```

4. **打开浏览器**
   访问 `http://localhost:5173`

### 生产构建

```bash
# 构建生产版本
pnpm build

# 预览生产构建
pnpm preview
```

## 📱 使用说明

1. **添加书籍**: 点击 "+" 按钮从设备导入 TXT 文件
2. **阅读**: 点击任意书籍开始阅读
3. **导航**: 使用方向键或滑动手势翻页
4. **搜索**: 使用搜索栏按标题、作者或内容查找书籍
5. **安装**: 添加到主屏幕以获得离线访问（PWA）

## 🏗️ 项目结构

```
weread/
├── components/          # 可复用 UI 组件
├── pages/              # 页面组件
├── store/              # 状态管理
├── lib/                # 工具函数
├── styles/             # 全局样式
├── locales/            # 国际化
├── assets/             # 静态资源
├── public/             # 公共资源
└── workers/            # Web workers
```

## 🤝 贡献

我们欢迎贡献！请随时提交问题和拉取请求。

1. Fork 仓库
2. 创建功能分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m '添加一些很棒的功能'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 打开拉取请求

## 📄 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情。

## 🙏 致谢

- 感谢所有帮助改进此项目的贡献者
- 受对简单、注重隐私的阅读体验需求的启发

## 📊 贡献者

<a href="https://github.com/ranuts/weread/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=ranuts/weread" />
</a>

## 📈 访问统计

![](http://profile-counter.glitch.me/ranuts-weread/count.svg)

---

## 📚 有用的电子书资源

### English

- [Z-Library](https://z-library.sk/): 知名的影子图书馆，拥有海量的多语言多格式电子书资源，普通用户每天可下载 10 本电子书。
- [Anna's Archive](https://annas-archive.org/): 一个影子图书馆搜索引擎，其通过汇总各种来源的数据对所有现存书籍进行编目。
- [Library Genesis+](https://libgen.li/): 知名的影子图书馆，格式包含 PDF、MOBI 和 EPUB。
- [sci-hub](https://sci-hub.ru/): 世界上第一个向公众提供数千万篇研究论文的网站。输入论文 DOI 获取。
- [Trantor](https://trantor.is/): 一个 EPUB 格式的无 DRM 电子书存储库。
- [VDOC.PUB](https://vdoc.pub/): 免费外文电子书下载站点。有 EPUB、PDF、DJVU、MOBI 等多种格式。
- [PDF DRIVE](https://www.pdfdrive.com/): PDF Drive 是一个 PDF 文档搜索引擎，可免费下载，大多是 PDF 格式。
- [The Pirate Bay](https://thepiratebay.org/index.html): 可通过选择 Ebook 分类，或通过 MOBI、EPUB、AZW3 等关键字搜索想要的英文 电子书。
- [1337x](https://1337x.to/): 可通过选择 Other 分类，或通过 MOBI、EPUB、AZW3 等关键字搜索想要的英文电子书。
- [Project Gutenberg](https://www.gutenberg.org/): 免费提供 MOBI、EPUB 等格式的电子书下载。古登堡计划是世界上第一个数字图书馆，提供大量版权过期而进入公有领域的书籍（公版书）。[这里](https://www.gutenberg.org/browse/languages/zh)也提供一些中文版公版书下载。
- [Standard Ebooks](https://standardebooks.org/ebooks): 免费提供重制的精校公版电子书，提供 EPUB、AZW3 和 KPEUB 格式。
- [DigiLibraries](https://digilibraries.com/): 免费电子 书库，超过 20,000 本免费 电子书，提供 MOBI、EPUB、PDF 等格式电子书。
- [MobileRead（EPUB 格式）](https://www.mobileread.com/forums/forumdisplay.php?f=130): MobileRead 论坛的无版权 EPUB 格式电子书上传区，无需注册可直接下载。
- [MobileRead（MOBI 格式）](https://www.mobileread.com/forums/forumdisplay.php?f=128): MobileRead 论坛的无版权 MOBI 格式电子书上传区，无需注册可直接下载。
- [epubBooks](https://www.epubbooks.com/): 提供高质量 EPUB 格式和适用于 Kindle 的 MOBI 格式公版电子书，其中有许多办好插图和脚注。下载电子书前必须使用邮箱注册并激活账号。
- [Planetebook](https://www.planetebook.com/): 免费英文电子书下载站点。有 EPUB、MOBI、PDF 格式。
- [Girlebooks](https://girlebooks.com/): 免费的女性作家电子书，提供适合 Kindle 阅读的 PRC 格式，以及 EPUB、PDF、微软阅读器、PDB 和纯文本格式。
- [Green Tea Press](https://greenteapress.com/wp/): 免费提供《Think Python》、《Think Bayes》等英文原版电子书的下载，这些电子书允许读者复制、分发其内容，也可以根据不同的需求自由地对其进行编辑，并帮助扩展新内容。
- [Baen Free Library](http://www.baen.com/library/): 提供免费的科幻、奇幻类书籍。提供在线阅读，也提供多格式下载，如 HTML、MOBI、EPUB、RTF、SONY 电子书格式、微软阅读器格式等。
- [Let Me Read](https://www.letmeread.net/): 英文 电子书下载站点。有 EPUB、MOBI、PDF 格式，在页面底部的 Free sample 处下载。
- [CODERPROG](https://coderprog.com/): 英文 电子书下载站点。有 EPUB、MOBI、PDF 格式，在页面底部的 Free sample 处下载。

### 中文 (简体)

- [Jiumo Search](https://www.jiumodiary.com/)：众多电子书资源一站式的整合搜索。提供各种电子书格式，text、PDF、mobi、epub 等等都有，每条分享点开就是网盘链接
- [搬书匠](http://www.banshujiang.cn/): 主要提供编程类书籍的下载，据程序员朋友反馈上面的书籍还是比较齐全的，有需要的伙伴可以去逛逛。
- [SaltTiger](http://www.salttiger.com/): 最新出版的计算机技术类电子 书。提供 MOBI、PDF、EPUB 格式下载。

### 中文 (繁體)

- [好讀](https://www.haodoo.net/)：中文电子书公益网站，提供 mobi、epub 等格式电子书下载。
- [Kmoe](https://mox.moe/)：漫画迷值得拥有
