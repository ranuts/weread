<p align="center">
  <a href="https://ranuts.github.io/weread/" target="_blank" rel="noopener noreferrer">
    <img width="180" src="https://ranuts.github.io/weread/read.svg" alt="weread logo">
  </a>
</p>

<p align="center">
  <strong>A pristine web reader with privacy-first architecture</strong>
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
  <a href="https://ranuts.github.io/weread/" target="_blank">🌐 Live Demo</a> • 
  <a href="#features">✨ Features</a> • 
  <a href="#tech-stack">🛠️ Tech Stack</a> • 
  <a href="#getting-started">🚀 Getting Started</a>
</p>

---

**This project is for learning and exchange purposes only. If you find any issues, please submit an issue or PR. It's intended for learning and exchange only; using it for other purposes isn't advised.**

English · [中文](./readme-zh_CN.md)

## 📖 About

> "Entities Unnecessarily Posited Must Not Exist" - Occam's Razor

Weread is a minimalist, privacy-focused web reader that provides a clean reading experience without any unnecessary complexity. Built with modern web technologies, it offers a native app-like experience through PWA capabilities.

## ✨ Features

- 📚 **Local TXT Support** - Import and read local TXT files directly
- 🤖 **AI Chapter Recognition** - Intelligent chapter extraction using AI algorithms
- 🧠 **Local AI Model** - Lightweight ONNX-based neural network for chapter detection
- 📱 **PWA Ready** - Install as a progressive web app for offline reading
- 🔒 **Privacy First** - No server-side processing, all data stays local
- 🌍 **Multi-language** - Support for Chinese and English interfaces
- 📖 **Responsive Design** - Optimized for both desktop and mobile devices
- 🎨 **Modern UI** - Clean and intuitive user interface
- ⚡ **Fast Performance** - Built with React and optimized for speed
- 🔄 **Smart Chapter Detection** - Hybrid approach combining traditional regex and AI methods
- 📊 **Reading Progress** - Track your reading progress automatically
- 🎯 **Confidence Scoring** - AI model provides confidence scores for chapter detection

## 🛠️ Tech Stack

- **Frontend Framework**: React 19 + TypeScript
- **Build Tool**: Vite 6
- **Styling**: Tailwind CSS 4 + SCSS
- **State Management**: Custom store with IndexedDB
- **Routing**: React Router DOM
- **PWA**: Service Worker + Web App Manifest
- **UI Components**: Custom components + RanUI
- **Text Processing**: Custom text transformation and encoding detection
- **AI/ML**: ONNX Runtime Web for local neural network inference
- **Package Manager**: pnpm

## 🚀 Getting Started

### Prerequisites

- Node.js >= 23.10.0
- pnpm (recommended) or npm

### Installation

1. **Clone the repository**

   ```bash
   git clone https://github.com/ranuts/weread.git
   cd weread
   ```

2. **Install dependencies**

   ```bash
   pnpm install
   ```

3. **Start development server**

   ```bash
   pnpm dev
   ```

4. **Open your browser**
   Navigate to `http://localhost:5173`

### Building for Production

```bash
# Build for production
pnpm build

# Preview production build
pnpm preview
```

## 📱 Usage

1. **Add Books**: Click the "+" button to import TXT files from your device
2. **Read**: Click on any book to start reading
3. **Navigate**: Use arrow keys or swipe gestures to turn pages
4. **Search**: Use the search bar to find books by title, author, or content
5. **AI Chapters**: Enable AI chapter recognition for intelligent chapter detection
6. **Install**: Add to home screen for offline access (PWA)

### 🤖 AI Chapter Recognition

Weread features a local AI model for intelligent chapter detection:

1. **Local Processing**: All AI processing happens locally in your browser
2. **Hybrid Approach**: Combines traditional regex patterns with neural network inference
3. **Confidence Scoring**: Each detected chapter comes with a confidence score
4. **Fallback System**: Automatically falls back to traditional methods if AI fails
5. **Model Management**: Download and manage ONNX models for different languages

#### Setting up the AI Model

1. Visit the AI Model Generator page (`/ai-model-generator`)
2. Click "Generate Model File" to download the ONNX model
3. Place the model file in `public/models/chapter_classifier.onnx`
4. Refresh the page to load the model
5. Enable AI chapter recognition in book settings

## 🏗️ Project Structure

```
weread/
├── components/          # Reusable UI components
├── pages/              # Page components
├── store/              # State management
├── lib/                # Utility functions
├── styles/             # Global styles
├── locales/            # Internationalization
├── assets/             # Static assets
├── public/             # Public assets
└── workers/            # Web workers
```

## 🤝 Contributing

We welcome contributions! Please feel free to submit issues and pull requests.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Thanks to all contributors who have helped improve this project
- Inspired by the need for a simple, privacy-focused reading experience

## 📊 Contributors

<a href="https://github.com/ranuts/weread/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=ranuts/weread" />
</a>

## 📈 Visitors

![](http://profile-counter.glitch.me/ranuts-weread/count.svg)

---

## 📚 Useful E-book Resources

### English

- [Z-Library](https://z-library.sk/): The well-known Shadow Library boasts a vast collection of multi-language and multi-format e-book resources. An average user can download 10 e-books every day.
- [Anna's Archive](https://annas-archive.org/): A shadow library search engine that catalogues all existing books by aggregating data from various sources.
- [Library Genesis+](https://libgen.li/): The well-known Shadow Library, with formats including PDF, MOBI and EPUB.
- [sci-hub](https://sci-hub.ru/): The world's first website that provides tens of millions of research papers to the public. Enter the DOI of the paper to obtain it.
- [Trantor](https://trantor.is/): An EPUB format DRM-free e-book repository.
- [VDOC.PUB](https://vdoc.pub/): Free foreign language e-book download sites. There are various formats such as EPUB, PDF, DJVU, MOBI, etc.
- [PDF DRIVE](https://www.pdfdrive.com/): PDF Drive is a PDF document search engine that can be downloaded for free and is mostly in PDF format.
- [The Pirate Bay](https://thepiratebay.org/index.html): You can select the Ebook category or search for the desired English e-books by keywords such as MOBI, EPUB, AZW3, etc.
- [1337x](https://1337x.to/): You can search for the desired English e-books by choosing the "Other" category or through keywords such as MOBI, EPUB, AZW3, etc.
- [Project Gutenberg](https://www.gutenberg.org/): Free e-book downloads in formats such as MOBI and EPUB are provided. The Gutenberg Project was the world's first digital library, offering a large number of books whose Copyrights had expired and entered the public domain (public edition books).[here] (https://www.gutenberg.org/browse/languages/zh) also provide some Chinese male version download books.
- [Standard Ebooks](https://standardebooks.org/ebooks): Free remastered and finely proofread public e-books are provided in EPUB, AZW3 and KPEUB formats.
- [DigiLibraries](https://digilibraries.com/): Free e-book library, with over 20,000 free e-books, offering e-books in formats such as MOBI, EPUB, and PDF.
- [MobileRead（EPUB）](https://www.mobileread.com/forums/forumdisplay.php?f=130): The copyright-free EPUB format e-book upload area on the MobileRead forum allows you to download directly without registration.
- [MobileRead（MOBI）](https://www.mobileread.com/forums/forumdisplay.php?f=128): The copyright-free MOBI format e-book upload area of the MobileRead Forum allows you to download directly without registration.
- [epubBooks](https://www.epubbooks.com/): Provide high-quality EPUB format and MOBI format public e-books for Kindle, among which there are many well-made illustrations and footnotes. Before downloading e-books, you must register and activate an account using an email address.
- [Planetebook](https://www.planetebook.com/): Free English e-book download site. It is available in EPUB, MOBI and PDF formats.
- [Girlebooks](https://girlebooks.com/): Free e-books by female writers, available in PRC format suitable for Kindle reading, as well as EPUB, PDF, Microsoft Reader, PDB and plain text formats.
- [Green Tea Press](https://greenteapress.com/wp/): Free downloads of original English e-books such as "Think Python" and "Think Bayes" are provided. These e-books allow readers to copy and distribute their contents, freely edit them according to different needs, and help expand new contents.
- [Baen Free Library](http://www.baen.com/library/): Free science fiction and fantasy books are provided. It provides online reading and also offers downloads in multiple formats, such as HTML, MOBI, EPUB, RTF, SONY e-book format, Microsoft Reader format, etc.
- [Let Me Read](https://www.letmeread.net/): English e-book download sites. It is available in EPUB, MOBI and PDF formats. Download it at the "Free sample" section at the bottom of the page.
- [CODERPROG](https://coderprog.com/): English e-book download sites. It is available in EPUB, MOBI and PDF formats. Download it at the "Free sample" section at the bottom of the page.

### 中文 (简体)

- [Jiumo Search](https://www.jiumodiary.com/)：One-stop integrated search of numerous e-book resources. We offer various e-book formats, including text, PDF, mobi, epub, and so on. When you click on each share, you will find a link to the cloud disk
- [搬书匠](http://www.banshujiang.cn/): It mainly provides the download of programming books. According to the feedback from programmer friends, the books above are quite complete. Those who need them can go and have a look.
- [SaltTiger](http://www.salttiger.com/): The newly published electronic books on computer technology. Available for download in MOBI, PDF and EPUB formats.

### 中文 (繁體)

- [好讀](https://www.haodoo.net/)：A public welfare website for Chinese e-books, providing downloads of e-books in formats such as mobi and epub.
