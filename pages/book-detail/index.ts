import 'ranui/icon';
import 'ranui/progress';
import 'ranui/loading';
import { debounce, getQuery } from 'ranuts/utils';
import { Div, Index, Show, Span, View, createEffect, createRef, onCleanup, signal } from 'ranui/builder';
import { getBookById } from '@/store/books';
import { detectChaptersByModel, hasModelForLang, resolveBookChapters } from '@/store/chapters';
import { prefetchModelsForLangs, uiLang } from '@/lib/nlp/modelCache';
import { getProgress, restorePage, saveProgress } from '@/store/progress';
import { getReadingSettings, settingsToCssVars, settingsToTypography, themeClass } from '@/store/settings';
import {
  DEFAULT_HIGHLIGHT_COLOR,
  HIGHLIGHT_COLORS,
  deleteNote,
  getNotesByBook,
  makeNoteId,
  saveNote,
} from '@/store/notes';
import { buildPageOffsets, pageForOffset, segmentPage } from '@/lib/notes/anchor';
import { CLASSIFY_STATUS } from '@/lib/nlp/protocol';
import { clearChapterEditContext, setChapterEditContext } from '@/lib/chapterEdit';
import { transformTextToExpectedFormat } from '@/lib/transformText';
import { fromStore } from '@/lib/reactive';
import {
  EVENT_NAME,
  getBookNotes,
  getCurrentBookDetail,
  getPageNum,
  getTextSyntaxTree,
  setBookNotes,
  setChapterDetect,
  setCurrentBookDetail,
  setPageNum,
  setTextSyntaxTree,
  syncHook,
} from '@/lib/subscribe';
import { resumeDB } from '@/store';
import { DEVICE_ENUM, getDevice } from '@/lib/hooks';
import { renderBookDetailOperate, renderMobileBookDetailOperate } from '@/components/DetailOperate';
import { ROUTE_PATH } from '@/router';
import { t } from '@/locales';
import type { Child, ElementBuilder } from 'ranui/builder';
import type { PageOptions } from '@/pages/home';
import type { BookInfo } from '@/store/books';
import type { DetectedChapter } from '@/lib/chapter';
import type { BookNote, HighlightColor } from '@/store/notes';

const ICON_FONT_SIZE = '14px';
const MOBILE_ICON_FONT_SIZE = '36px';

const withViewTransition = (fn: () => void): void => {
  if (document.startViewTransition) document.startViewTransition(fn);
  else fn();
};

/** 上一页（桌面翻 2 页 = 两列）。读写 store，包 View Transition。 */
const pre = (num = 1): void => {
  const p = getPageNum();
  if (p === 0) return;
  withViewTransition(() => setPageNum(Math.max(p - num, 0)));
};

/** 下一页（桌面翻 2 页）。 */
const next = (num = 1): void => {
  const p = getPageNum();
  const size = getTextSyntaxTree()?.totalPage ?? 0;
  withViewTransition(() => setPageNum(Math.min(p + num, size)));
};

/**
 * 桌面键盘翻页：←/PageUp 上一页，→/PageDown/Space 下一页（Shift+Space 上一页）。
 * 输入聚焦（书内搜索）或带修饰键时不拦截，避免抢占浏览器/输入快捷键。
 * 需在 `createRoot` 作用域内调用（用 onCleanup 解绑），且只在桌面布局绑定。
 */
const bindKeyboardPaging = (): void => {
  const onKey = (e: KeyboardEvent): void => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const el = document.activeElement as HTMLElement | null;
    if (el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA' || el?.isContentEditable) return;
    if (el?.closest?.('r-input, r-content, .wr-menu')) return;
    switch (e.key) {
      case 'ArrowLeft':
      case 'PageUp':
        e.preventDefault();
        pre(2);
        break;
      case 'ArrowRight':
      case 'PageDown':
        e.preventDefault();
        next(2);
        break;
      case ' ':
        e.preventDefault();
        e.shiftKey ? pre(2) : next(2);
        break;
    }
  };
  window.addEventListener('keydown', onKey);
  onCleanup(() => window.removeEventListener('keydown', onKey));
};

/**
 * 阅读页：加载链（`getBookById`→`resolveBookChapters`→`transformTextToExpectedFormat`→
 * `setTextSyntaxTree`）+ `fromStore` 翻页信号（只更新标题 + 正文列）+ AI 增强 + 返回 morph。
 * `transformText` 需要真实布局的容器（clientW/H≥30），故加载链在 `requestAnimationFrame`
 * （挂载 + 布局后）里跑。SSR 只出外壳。必须在 `createRoot` 作用域内调用。
 */
export const renderBookDetail = (opts: PageOptions = {}): ElementBuilder => {
  if (opts.ssr) return Div().class('wr-reader');

  const { id } = getQuery() as { id?: string };
  const bookDetail = fromStore(getCurrentBookDetail, EVENT_NAME.SET_CURRENT_BOOK_DETAIL);
  const tree = fromStore(getTextSyntaxTree, EVENT_NAME.SET_TEXT_SYNTAX_TREE);
  const pageNum = fromStore(getPageNum, EVENT_NAME.SET_CURRENT_BOOK_PAGE);
  // 章节自动识别（模型增强）状态经共享 store 上报，目录模块就地显 loading / 手动入口。
  let enhancing = false; // 重入保护
  let detectTimer: ReturnType<typeof setTimeout> | undefined; // 停留 700ms 才自动分析（快进快出不触发）

  // 续读：进度恢复完成前不写，避免初始 page 0 覆盖已存进度。
  let progressRestored = false;
  const savePos = debounce(() => {
    if (id) void saveProgress(id, pageNum(), tree().totalPage);
  }, 700);

  const rootRef = createRef<HTMLDivElement>(); // 阅读页根（承载阅读设置的 CSS 变量 + 主题 class）
  const containerRef = createRef<HTMLDivElement>(); // book-info morph 目标
  const showContainerRef = createRef<HTMLDivElement>(); // 分页测量容器（桌面左列 / 移动正文）
  const colTwoRef = createRef<HTMLDivElement>(); // 桌面右列（划线选区计算）
  const contentRef: { current: ArrayBuffer | Uint8Array<ArrayBuffer> | null } = { current: null };
  let lastChapters: DetectedChapter[] = []; // 最近一次分页用的章节（阅读设置改变时按同章节重排）

  /** 当前页的章节标题。 */
  const chapterTitle = (): string => {
    const tr = tree();
    return tr.titleIdTitle[tr.pageTitleId[pageNum()]] ?? '';
  };

  // ── 划线/笔记 ──────────────────────────────────────────────────────────────
  const notes = fromStore(getBookNotes, EVENT_NAME.SET_BOOK_NOTES);
  // 每页在「可见文本」坐标系的全局起始偏移，按 tree 引用记忆（tree 不变则不重算，大书省 O(n)）。
  let offsetsCache: { tree: unknown; offsets: number[] } | null = null;
  const pageOffsets = (): number[] => {
    const tr = tree();
    if (offsetsCache?.tree !== tr) offsetsCache = { tree: tr, offsets: buildPageOffsets(tr.pageText) };
    return offsetsCache.offsets;
  };
  /** 把某页文本按落在其中的划线切成「普通/高亮」段。 */
  const pageSegments = (pageIndex: number) => {
    const pt = tree().pageText[pageIndex];
    if (!pt) return [];
    return segmentPage(pt.text, pageOffsets()[pageIndex] ?? 0, notes());
  };

  // 划线操作浮层：create=刚选中未存（选颜色才落库）；edit=点已有高亮（改色/写想法/删）。
  const [tb, setTb] = signal<{ x: number; y: number; mode: 'create' | 'edit'; note: BookNote } | null>(null);

  const loadNotes = (bookId: string): void => {
    getNotesByBook(bookId).then((list) => setBookNotes(list));
  };

  /** 从当前选区算出可见文本全局偏移 + 位置，弹出 create 浮层（选颜色才真正落库）。 */
  const onSelectEnd = (colEl: HTMLElement, pageIndex: number): void => {
    if (!id) return;
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    if (!colEl.contains(range.startContainer) || !colEl.contains(range.endContainer)) return;
    const selText = range.toString();
    if (!selText.trim()) return;
    // 选区起点前的可见文本长度 = 页内相对起始（UTF-16 码元，与分页/slice 一致）。
    const pre = range.cloneRange();
    pre.selectNodeContents(colEl);
    pre.setEnd(range.startContainer, range.startOffset);
    const start = (pageOffsets()[pageIndex] ?? 0) + pre.toString().length;
    const rect = range.getBoundingClientRect();
    const now = Date.now();
    const draft: BookNote = {
      id: makeNoteId(id, start, now),
      bookId: id,
      start,
      end: start + selText.length,
      text: selText,
      color: DEFAULT_HIGHLIGHT_COLOR,
      chapterTitle: chapterTitle(),
      createdAt: now,
      updatedAt: now,
    };
    setTb({ x: rect.left + rect.width / 2, y: rect.top, mode: 'create', note: draft });
  };

  /** 点正文里已存在的高亮 → edit 浮层（桌面）。 */
  const onMarkClick = (target: HTMLElement): void => {
    const el = target.closest('[data-note-id]') as HTMLElement | null;
    const nid = el?.getAttribute('data-note-id');
    if (!nid) return;
    const note = notes().find((n) => n.id === nid);
    if (!note) return;
    const rect = el!.getBoundingClientRect();
    setTb({ x: rect.left + rect.width / 2, y: rect.top, mode: 'edit', note });
  };

  const applyColor = (color: HighlightColor): void => {
    const cur = tb();
    if (!cur) return;
    const note = { ...cur.note, color };
    void saveNote(note).then(() => id && loadNotes(id));
    setTb({ ...cur, mode: 'edit', note });
    window.getSelection()?.removeAllRanges();
  };

  const saveThought = (thought: string): void => {
    const cur = tb();
    if (!cur || cur.mode !== 'edit') return;
    const note = { ...cur.note, thought };
    void saveNote(note).then(() => id && loadNotes(id));
    setTb({ ...cur, note });
  };

  const removeActiveNote = (): void => {
    const cur = tb();
    if (!cur) return;
    void deleteNote(cur.note.id).then(() => id && loadNotes(id));
    setTb(null);
  };

  /**
   * 划线段渲染（返回 Index 句柄，直接进列容器，让 `white-space:pre-wrap` 作用到 inline span）：
   * 统一用 span，反应式切换高亮 class（避免 mark/span 标签翻转）；高亮样式须布局中性（仅背景，无 padding）
   * 以免影响已按纯文本度量的分页。
   */
  const segmentsIndex = (pageIndex: () => number) =>
    Index({
      each: () => pageSegments(pageIndex()),
      render: (seg) =>
        Span()
          .class(() => (seg().note ? `wr-mark wr-mark-${seg().note!.color}` : ''))
          .attr('data-note-id', () => seg().note?.id ?? '')
          .text(() => seg().text),
    });

  /** 划线操作浮层（颜色 + 想法编辑 + 删除）。固定定位到选区/高亮上方。 */
  const renderNoteToolbar = (): Child =>
    Show({
      when: () => tb() !== null,
      children: () =>
        Div()
          .class('wr-note-toolbar')
          .style('left', () => `${Math.round(tb()!.x)}px`)
          .style('top', () => `${Math.round(tb()!.y)}px`)
          .on('mousedown', (e: MouseEvent) => e.preventDefault()) // 保住选区/不触发外部关闭
          .children(
            Div()
              .class('wr-note-colors')
              .children(
                ...HIGHLIGHT_COLORS.map((c) =>
                  Span()
                    .class(() => `wr-note-swatch wr-mark-${c} ${tb()?.note.color === c ? 'is-active' : ''}`)
                    .on('click', () => applyColor(c)),
                ),
              ),
            // 想法编辑 + 删除仅在已落库（edit）后出现；textarea 初值一次性 seed，输入中不被反应式重置。
            Show({
              when: () => tb()?.mode === 'edit',
              children: () =>
                Div()
                  .class('wr-note-edit')
                  .children(
                    View('textarea')
                      .class('wr-note-thought')
                      .attr('placeholder', t('note_thought_placeholder'))
                      .attr('rows', '2')
                      .text(tb()?.note.thought ?? '')
                      .on('change', (e: Event) => saveThought((e.target as HTMLTextAreaElement).value)),
                    Div()
                      .class('wr-note-actions')
                      .children(
                        View('a').class('wr-note-del').text(t('delete_note')).on('click', removeActiveNote),
                      ),
                  ),
            }),
          ),
    });

  const toHome = (): void => {
    if (document.startViewTransition && id) {
      containerRef.current?.style.setProperty('view-transition-name', `book-info-${id}`);
      document.startViewTransition(() => {
        containerRef.current?.style.setProperty('view-transition-name', '');
        window.location.href = ROUTE_PATH.HOME;
      });
    } else {
      window.location.href = ROUTE_PATH.HOME;
    }
  };

  /**
   * 模型章节识别（唯一自动识别路径）。状态经 `setChapterDetect` 上报到共享 store，目录模块就地显
   * 进度圈（下载模型% → 识别%）；识别出章节则重排语法树。结果由 store 层缓存到 IndexedDB，重开不再跑。
   */
  const runDetect = async (): Promise<void> => {
    if (!id || !contentRef.current || enhancing) return;
    enhancing = true;
    setChapterDetect({ status: 'detecting', phase: 'download', progress: 0 });
    try {
      const record = await detectChaptersByModel(id, contentRef.current, {
        onProgress: (p) => {
          setChapterDetect({
            status: 'detecting',
            phase: p.status === CLASSIFY_STATUS ? 'detect' : 'download',
            progress: typeof p.progress === 'number' ? Math.round(p.progress) : 0,
          });
        },
      });
      if (record && record.chapters.length > 0 && showContainerRef.current && contentRef.current) {
        const atStart = pageNum() === 0; // 用户还没翻页才回到首页，避免打断阅读
        paginateToTree({ content: contentRef.current, title: bookDetail().title ?? '', chapters: record.chapters });
        if (atStart) setPageNum(0);
        // 识别出目录后刷新编辑上下文的章节副本
        setChapterEditContext({
          id,
          content: contentRef.current,
          container: showContainerRef.current,
          title: bookDetail().title ?? '',
          lang: record.lang,
          chapters: record.chapters.map((c) => ({ ...c })),
        });
      }
    } finally {
      enhancing = false;
      // 回到 available（常驻按钮），而非 idle——识别完仍可手动「重新生成目录」。runDetect 仅对有模型的书触发。
      setChapterDetect({ status: 'available', phase: 'download', progress: 0 });
    }
  };

  /**
   * 分页构建语法树。分页算法已优化到百万字约 20ms（charCode 查表替正则 + 索引切片替字符串拼接），
   * 单帧内完成，主线程无感——直接同步跑，不再上 Worker（省掉消息往返与 dev 下 worker 编译的不确定性）。
   */
  const paginateToTree = (opts: {
    content: ArrayBuffer | Uint8Array<ArrayBuffer>;
    title: string;
    chapters: DetectedChapter[];
  }): void => {
    const el = showContainerRef.current;
    if (!el) return;
    const { content, title, chapters } = opts;
    lastChapters = chapters; // 记住当前章节，供阅读设置变更时按同章节重排
    setTextSyntaxTree(
      transformTextToExpectedFormat({
        content,
        title,
        container: el,
        chapters,
        typography: settingsToTypography(getReadingSettings()),
      }),
    );
  };

  /**
   * 把阅读设置落到阅读页根元素：CSS 变量（字号/行距/边距/字体）+ 主题 class（护眼/OLED）。
   * 桌面根是独立的 `.wr-reader`（rootRef），移动端根同时是 morph 目标（containerRef）——取其一。
   */
  const applyReaderChrome = (): void => {
    const el = rootRef.current ?? containerRef.current;
    if (!el) return;
    const s = getReadingSettings();
    const vars = settingsToCssVars(s);
    Object.entries(vars).forEach(([k, v]) => el.style.setProperty(k, v));
    el.classList.remove('wr-theme-sepia', 'wr-theme-oled');
    const cls = themeClass(s);
    if (cls) el.classList.add(cls);
  };

  /**
   * 阅读设置变更：先落 CSS（字号/边距即时生效、容器尺寸随边距变化），再按同章节 + 新排版倍率重排，
   * 并按百分比把阅读位置映射到新分页（换字号/行距导致总页数变化时不丢位置）。
   */
  const onSettingsChange = (): void => {
    applyReaderChrome();
    if (!contentRef.current || !showContainerRef.current) return;
    const oldTotal = getTextSyntaxTree().totalPage;
    const percent = oldTotal > 0 ? getPageNum() / oldTotal : 0;
    paginateToTree({ content: contentRef.current, title: bookDetail().title ?? '', chapters: lastChapters });
    const newTotal = getTextSyntaxTree().totalPage;
    setPageNum(Math.max(0, Math.min(Math.round(percent * newTotal), newTotal)));
  };

  const loadBook = (bookId: string): void => {
    getBookById<BookInfo>(bookId)
      .then((res) => {
        if (res.error) {
          resumeDB().then(() => loadBook(bookId));
          return;
        }
        setCurrentBookDetail(res.data);
        const { content, title } = res.data;
        // 章节优先走 IndexedDB 缓存，未命中则识别并写缓存
        resolveBookChapters(bookId, content).then((bookChapters) => {
          paginateToTree({ content, title, chapters: bookChapters.chapters });
          // 续读：恢复到上次页码（映射到当前分页），恢复完成后才允许保存。
          getProgress(bookId).then((p) => {
            if (p) {
              const target = restorePage(p, getTextSyntaxTree().totalPage);
              if (target > 0) setPageNum(target);
            }
            progressRestored = true;
          });
          contentRef.current = content;
          containerRef.current?.style.setProperty('view-transition-name', `book-info-${bookId}`);
          // 注册目录编辑上下文（章节副本，供就地增删改后重建树 + 存 manual）
          if (showContainerRef.current) {
            setChapterEditContext({
              id: bookId,
              content,
              container: showContainerRef.current,
              title,
              lang: bookChapters.lang,
              chapters: bookChapters.chapters.map((c) => ({ ...c })),
            });
          }
          // 目录里**常驻**手动按钮：只要该语言有模型（available），随时可点「重新生成目录」重跑，不管缓存来源。
          const canDetect = hasModelForLang(bookChapters.lang);
          setChapterDetect({ status: canDetect ? 'available' : 'idle', phase: 'download', progress: 0 });
          // 无缓存(pending) + 有模型 → **停在书上 ~700ms 才自动跑**首次分析（detectTimer，快进快出 700ms 内离开
          // 就不触发，避免反复启停模型实例）；模型权重由 SW 预取持久缓存、分析在 nlp worker 跑，不冻结 reader。
          if (bookChapters.source === 'pending' && canDetect) {
            detectTimer = setTimeout(() => void runDetect(), 700);
          }
        });
      })
      .catch(() => {
        window.location.href = ROUTE_PATH.HOME;
      });
  };

  // 打开阅读页即请求预取本地语言的模型（由 Service Worker 在其上下文下载 + 持久缓存，
  // 快进快出/整页导航都不会中断——不像主线程 fetch 一离开就 abort 重下）。省流量/慢网自动跳过。
  prefetchModelsForLangs([uiLang()]);
  // 翻页/重排后防抖保存阅读进度（进度恢复完成后才存，避免初始 page 0 覆盖）。
  createEffect(() => {
    pageNum();
    tree().totalPage;
    if (progressRestored) savePos();
  });
  // 容器挂载 + 布局后：先落阅读设置（CSS 变量/主题），再跑分页（transformText 依赖真实 clientWidth/Height）
  if (id) requestAnimationFrame(() => {
    applyReaderChrome();
    loadBook(id);
  });
  // 目录里「识别章节」按钮的手动出口（省流量/慢网场景）→ 跑一次模型识别
  const onRunEnhance = (): void => void runDetect();
  syncHook.tap(EVENT_NAME.RUN_ENHANCE, onRunEnhance);
  // 阅读设置变更（字号/行距/边距/主题/字体）→ 落 CSS + 按同章节重排并保位置
  syncHook.tap(EVENT_NAME.SET_READING_SETTINGS, onSettingsChange);
  onCleanup(() => {
    clearTimeout(detectTimer); // 快进快出：离开时取消待触发的自动分析
    clearChapterEditContext(); // 清理目录编辑上下文，避免下一本书误用
    syncHook.off(EVENT_NAME.RUN_ENHANCE, onRunEnhance);
    syncHook.off(EVENT_NAME.SET_READING_SETTINGS, onSettingsChange);
    setChapterDetect({ status: 'idle', phase: 'download', progress: 0 }); // 复位共享状态
  });

  // ── 桌面：双列 + 上/下页按钮 ──────────────────────────────────────────────
  const desktopLayout = (): ElementBuilder => {
    bindKeyboardPaging();
    return Div()
      .class('wr-reader wr-reader-desktop')
      .ref(rootRef)
      .children(
        Div()
          .class('wr-reader-inner')
          .children(
            Div()
              .class('wr-reader-topbar')
              .children(
                View('a')
                  .class('wr-reader-book-title')
                  .text(() => bookDetail().title ?? '')
                  .on('click', toHome),
                Div()
                  .class('wr-reader-topbar-right')
                  .children(View('a').class('wr-reader-home').text(t('home')).on('click', toHome)),
              ),
            Div()
              .class('wr-reader-book book-info-container')
              .ref(containerRef)
              .style('view-transition-name', id ? `book-info-${id}` : '')
              .children(
                Div().class('wr-reader-chapter').text(chapterTitle),
                Div()
                  .class('wr-reader-columns')
                  .children(
                    Div()
                      .class('wr-reader-col')
                      .ref(showContainerRef)
                      .on('mouseup', () => showContainerRef.current && onSelectEnd(showContainerRef.current, pageNum()))
                      .on('click', (e: MouseEvent) => onMarkClick(e.target as HTMLElement))
                      .children(segmentsIndex(() => pageNum())),
                    Div()
                      .class('wr-reader-col')
                      .ref(colTwoRef)
                      .on('mouseup', () => colTwoRef.current && onSelectEnd(colTwoRef.current, pageNum() + 1))
                      .on('click', (e: MouseEvent) => onMarkClick(e.target as HTMLElement))
                      .children(segmentsIndex(() => pageNum() + 1)),
                  ),
                Div()
                  .class('wr-reader-nav')
                  .children(
                    Div()
                      .class('wr-reader-nav-btn')
                      .on('click', () => pre(2))
                      .children(
                        View('r-icon').class('wr-rot-90').attr('name', 'more').cssVar('--ran-icon-font-size', ICON_FONT_SIZE),
                        Span().text(t('previous_page')),
                      ),
                    // 阅读位置指示（与移动端对齐）：当前页 / 总页
                    Span()
                      .class('wr-reader-nav-pos')
                      .text(() => {
                        const total = tree().totalPage;
                        return total ? `${Math.min(pageNum() + 1, total + 1)} / ${total + 1}` : '';
                      }),
                    Div()
                      .class('wr-reader-nav-btn')
                      .on('click', () => next(2))
                      .children(
                        Span().text(t('next_page')),
                        View('r-icon')
                          .class('wr-rot-neg-90')
                          .attr('name', 'more')
                          .cssVar('--ran-icon-font-size', ICON_FONT_SIZE),
                      ),
                  ),
              ),
          ),
        renderBookDetailOperate(),
      );
  };

  // ── 移动：单列 + 触控翻页 + 上/下 chrome 栏 ───────────────────────────────
  const mobileLayout = (): ElementBuilder => {
    const [isTouch, setIsTouch] = signal(false);
    let touchStartX = 0;
    const onTouchStart = (e: TouchEvent): void => {
      touchStartX = e.touches[0]?.clientX ?? 0;
    };
    const onTouchEnd = (e: TouchEvent): void => {
      const dist = (e.changedTouches[0]?.clientX ?? 0) - touchStartX;
      if (Math.abs(dist) < 30) return;
      dist > 0 ? pre() : next();
    };
    const onClick = (e: MouseEvent): void => {
      const w = showContainerRef.current?.clientWidth || 0;
      if (!w) return;
      if (e.clientX < w / 4) {
        pre();
        setIsTouch(false);
      } else if (e.clientX > (w / 4) * 3) {
        next();
        setIsTouch(false);
      } else {
        setIsTouch(!isTouch());
      }
    };
    const back = (): void => window.history.back();
    const barHeight = (): string => (isTouch() ? '3.5rem' : '0px');

    return Div()
      .class('wr-reader wr-reader-mobile')
      .ref(containerRef)
      .style('view-transition-name', id ? `book-info-${id}` : '')
      .children(
        Div()
          .class('wr-reader-mobile-inner')
          .children(
            Div()
              .class('wr-reader-chrome wr-reader-chrome-top')
              .style('height', barHeight)
              .children(
                View('r-icon')
                  .class('wr-rot-90')
                  .attr('name', 'more')
                  .cssVar('--ran-icon-font-size', MOBILE_ICON_FONT_SIZE)
                  .on('click', back),
              ),
            Div()
              .class('wr-reader-mobile-text')
              .ref(showContainerRef)
              .on('touchstart', onTouchStart)
              .on('touchend', onTouchEnd)
              .on('click', onClick)
              .text(() => tree().pageText[pageNum()]?.text ?? ''),
            Div()
              .class('wr-reader-chrome wr-reader-chrome-bottom')
              .style('height', barHeight)
              .children(renderMobileBookDetailOperate()),
            Div()
              .class('wr-reader-page-indicator')
              .text(() => `${pageNum() + 1} / ${tree().totalPage + 1}`),
          ),
      );
  };

  return getDevice() === DEVICE_ENUM.MOBILE ? mobileLayout() : desktopLayout();
};
