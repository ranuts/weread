import 'ranui/icon';
import 'ranui/progress';
import 'ranui/loading';
import { getQuery } from 'ranuts/utils';
import { Div, Show, Span, View, createRef, onCleanup, signal } from 'ranui/builder';
import { getBookById } from '@/store/books';
import { canEnhanceWithModel, enhanceChaptersWithModel, resolveBookChapters } from '@/store/chapters';
import { canAutoEnhance } from '@/lib/nlp/modelCache';
import { CLASSIFY_STATUS } from '@/lib/nlp/protocol';
import { clearChapterEditContext, setChapterEditContext } from '@/lib/chapterEdit';
import { transformTextToExpectedFormat } from '@/lib/transformText';
import { paginateInWorker } from '@/lib/pagingClient';
import { fromStore } from '@/lib/reactive';
import {
  EVENT_NAME,
  getCurrentBookDetail,
  getPageNum,
  getTextSyntaxTree,
  setCurrentBookDetail,
  setPageNum,
  setTextSyntaxTree,
} from '@/lib/subscribe';
import { resumeDB } from '@/store';
import { DEVICE_ENUM, getDevice } from '@/lib/hooks';
import { renderBookDetailOperate, renderMobileBookDetailOperate } from '@/components/DetailOperate';
import { ROUTE_PATH } from '@/router';
import { t } from '@/locales';
import type { ElementBuilder } from 'ranui/builder';
import type { PageOptions } from '@/pages/home';
import type { BookInfo } from '@/store/books';
import type { DetectedChapter } from '@/lib/chapter';

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
  const [canEnhance, setCanEnhance] = signal(false);
  const [enhanceProgress, setEnhanceProgress] = signal<number | null>(null);
  // 增强阶段：'download'（下载模型）/ 'detect'（逐行推理），驱动进度文案
  const [enhancePhase, setEnhancePhase] = signal<'download' | 'detect'>('download');
  // 手动增强无改善时的短暂提示（避免「点了没反应像坏了」）
  const [enhanceNote, setEnhanceNote] = signal<string | null>(null);
  // 分页进行中（Worker 计算大书语法树时）：显加载态，主线程不冻结
  const [paging, setPaging] = signal(false);

  const containerRef = createRef<HTMLDivElement>(); // book-info morph 目标
  const showContainerRef = createRef<HTMLDivElement>(); // 分页测量容器
  const contentRef: { current: ArrayBuffer | Uint8Array<ArrayBuffer> | null } = { current: null };
  const ruleChaptersRef: { current: DetectedChapter[] } = { current: [] };

  /** 当前页的章节标题。 */
  const chapterTitle = (): string => {
    const tr = tree();
    return tr.titleIdTitle[tr.pageTitleId[pageNum()]] ?? '';
  };

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

  /** @param auto 是否为「打开 none 书自动触发」（自动路径无改善时保持静默，手动才提示） */
  const runEnhance = async (auto = false): Promise<void> => {
    if (!id || !contentRef.current || enhanceProgress() !== null) return;
    setEnhanceNote(null);
    setEnhancePhase('download');
    setEnhanceProgress(0);
    try {
      const result = await enhanceChaptersWithModel(id, contentRef.current, ruleChaptersRef.current, {
        onProgress: (p) => {
          setEnhancePhase(p.status === CLASSIFY_STATUS ? 'detect' : 'download');
          if (typeof p.progress === 'number') setEnhanceProgress(Math.round(p.progress));
        },
      });
      setCanEnhance(false);
      if (result?.improved && showContainerRef.current && contentRef.current) {
        paginateToTree({
          content: contentRef.current,
          title: bookDetail().title ?? '',
          chapters: result.record.chapters,
          encoding: bookDetail().encoding ?? 'utf-8',
        });
        setPageNum(0);
        // 增强后目录变了，刷新编辑上下文的章节副本
        setChapterEditContext({
          id,
          content: contentRef.current,
          container: showContainerRef.current,
          title: bookDetail().title ?? '',
          lang: result.record.lang,
          chapters: result.record.chapters.map((c) => ({ ...c })),
        });
      } else if (!auto && !result?.improved) {
        // 手动点了增强但模型没识别出更多章节：给个短暂反馈，几秒后自动消失
        setEnhanceNote(t('enhanceNoMore'));
        setTimeout(() => setEnhanceNote(null), 4000);
      }
    } finally {
      setEnhanceProgress(null);
    }
  };

  /**
   * 分页构建语法树：优先走 Worker（大书不冻结主线程），Worker 不可用时回退主线程同步。
   * 测量在主线程（读一次 clientW/H），重活在 Worker。
   */
  const paginateToTree = (opts: {
    content: ArrayBuffer | Uint8Array<ArrayBuffer>;
    title: string;
    chapters: DetectedChapter[];
    encoding: string;
  }): void => {
    const el = showContainerRef.current;
    if (!el) return;
    const { content, title, chapters, encoding } = opts;
    setPaging(true);
    const done = (tr: ReturnType<typeof transformTextToExpectedFormat>): void => {
      setTextSyntaxTree(tr);
      setPaging(false);
    };
    paginateInWorker({
      content,
      encoding: encoding || 'utf-8',
      clientWidth: el.clientWidth,
      clientHeight: el.clientHeight,
      title,
      chapters,
      prefaceLabel: t('preface'),
    })
      .then(done)
      .catch(() => done(transformTextToExpectedFormat({ content, title, container: el, chapters })));
  };

  const loadBook = (bookId: string): void => {
    getBookById<BookInfo>(bookId)
      .then((res) => {
        if (res.error) {
          resumeDB().then(() => loadBook(bookId));
          return;
        }
        setCurrentBookDetail(res.data);
        const { content, title, encoding } = res.data;
        // 章节优先走 IndexedDB 缓存，未命中则识别并写缓存
        resolveBookChapters(bookId, content).then((bookChapters) => {
          paginateToTree({ content, title, chapters: bookChapters.chapters, encoding });
          contentRef.current = content;
          ruleChaptersRef.current = bookChapters.chapters;
          setCanEnhance(canEnhanceWithModel(bookChapters));
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
          // 规则完全没识别出目录（none）→ 打开时自动跑一次模型（模型已预取则秒开、
          // 省流量/慢网未缓存则回退到手动按钮）。见 canAutoEnhance。
          if (bookChapters.confidence === 'none' && canEnhanceWithModel(bookChapters)) {
            canAutoEnhance(bookChapters.lang).then((ok) => {
              if (ok) void runEnhance(true);
            });
          }
        });
      })
      .catch(() => {
        window.location.href = ROUTE_PATH.HOME;
      });
  };

  // 容器挂载 + 布局后再跑分页（transformText 依赖真实 clientWidth/Height）
  if (id) requestAnimationFrame(() => loadBook(id));
  // 离开阅读页时清理目录编辑上下文，避免下一本书误用
  onCleanup(clearChapterEditContext);

  /** AI 增强区：进行中显 r-progress(下载%)/r-loading(检测)，可增强显链接。 */
  const enhanceArea = (): ElementBuilder =>
    Div()
      .class('wr-reader-enhance')
      .children(
        Show({
          when: () => enhanceProgress() !== null,
          children: () =>
            Div()
              .class('wr-reader-progress')
              .children(
                Show({
                  when: () => (enhanceProgress() ?? 0) > 0,
                  children: () =>
                    View('r-progress')
                      .class('wr-reader-progress-bar')
                      .attr('percent', () => String(enhanceProgress() ?? 0)),
                  fallback: () =>
                    View('r-loading')
                      .attr('name', 'circle-fold')
                      .cssVar('--loading-circle-fold-item-before-background', 'var(--ran-color-primary)'),
                }),
                Span()
                  .class('wr-reader-progress-text')
                  .text(() => {
                    const p = enhanceProgress() ?? 0;
                    const label = enhancePhase() === 'detect' ? t('modelEnhancing') : t('modelDownloading');
                    return p > 0 ? `${label} ${p}%` : label;
                  }),
              ),
        }),
        Show({
          when: () => canEnhance() && enhanceProgress() === null,
          children: () =>
            View('a')
              .class('wr-reader-enhance-link')
              .attr('title', t('enhanceHint'))
              .text(t('enhanceCatalogue'))
              .on('click', () => {
                void runEnhance();
              }),
        }),
        // 手动增强无改善的短暂提示
        Show({
          when: () => enhanceNote() !== null && enhanceProgress() === null,
          children: () => Span().class('wr-reader-enhance-note').text(() => enhanceNote() ?? ''),
        }),
      );

  // ── 桌面：双列 + 上/下页按钮 ──────────────────────────────────────────────
  const desktopLayout = (): ElementBuilder => {
    bindKeyboardPaging();
    return Div()
      .class('wr-reader wr-reader-desktop')
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
                  .children(
                    enhanceArea(),
                    View('a').class('wr-reader-home').text(t('home')).on('click', toHome),
                  ),
              ),
            Div()
              .class('wr-reader-book book-info-container')
              .ref(containerRef)
              .style('view-transition-name', id ? `book-info-${id}` : '')
              .children(
                // 分页中（Worker 计算语法树）：纸面中央转圈，主线程保持可交互
                Show({
                  when: () => paging(),
                  children: () =>
                    Div()
                      .class('wr-reader-loading')
                      .children(
                        View('r-loading')
                          .attr('name', 'circle-fold')
                          .cssVar('--loading-circle-fold-item-before-background', 'var(--ran-color-primary)'),
                      ),
                }),
                Div().class('wr-reader-chapter').text(chapterTitle),
                Div()
                  .class('wr-reader-columns')
                  .children(
                    Div()
                      .class('wr-reader-col')
                      .ref(showContainerRef)
                      .text(() => tree().pageText[pageNum()]?.text ?? ''),
                    Div()
                      .class('wr-reader-col')
                      .text(() => tree().pageText[pageNum() + 1]?.text ?? ''),
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
            Show({
              when: () => paging(),
              children: () =>
                Div()
                  .class('wr-reader-loading')
                  .children(
                    View('r-loading')
                      .attr('name', 'circle-fold')
                      .cssVar('--loading-circle-fold-item-before-background', 'var(--ran-color-primary)'),
                  ),
            }),
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
              .children(renderMobileBookDetailOperate(), enhanceArea()),
            Div()
              .class('wr-reader-page-indicator')
              .text(() => `${pageNum() + 1} / ${tree().totalPage + 1}`),
          ),
      );
  };

  return getDevice() === DEVICE_ENUM.MOBILE ? mobileLayout() : desktopLayout();
};
