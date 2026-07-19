import 'ranui/icon';
import 'ranui/progress';
import 'ranui/loading';
import { getQuery } from 'ranuts/utils';
import { Div, Show, Span, View, createRef, signal } from 'ranui/builder';
import { getBookById } from '@/store/books';
import { canEnhanceWithModel, enhanceChaptersWithModel, resolveBookChapters } from '@/store/chapters';
import { transformTextToExpectedFormat } from '@/lib/transformText';
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

  const runEnhance = async (): Promise<void> => {
    if (!id || !contentRef.current || enhanceProgress() !== null) return;
    setEnhanceProgress(0);
    try {
      const enhanced = await enhanceChaptersWithModel(id, contentRef.current, ruleChaptersRef.current, {
        onProgress: (p) => {
          if (typeof p.progress === 'number') setEnhanceProgress(Math.round(p.progress));
        },
      });
      setCanEnhance(false);
      if (enhanced && showContainerRef.current && contentRef.current) {
        setTextSyntaxTree(
          transformTextToExpectedFormat({
            content: contentRef.current,
            title: bookDetail().title ?? '',
            container: showContainerRef.current,
            chapters: enhanced.chapters,
          }),
        );
        setPageNum(0);
      }
    } finally {
      setEnhanceProgress(null);
    }
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
          setTextSyntaxTree(
            transformTextToExpectedFormat({
              content,
              title,
              container: showContainerRef.current!,
              chapters: bookChapters.chapters,
            }),
          );
          contentRef.current = content;
          ruleChaptersRef.current = bookChapters.chapters;
          setCanEnhance(canEnhanceWithModel(bookChapters));
          containerRef.current?.style.setProperty('view-transition-name', `book-info-${bookId}`);
        });
      })
      .catch(() => {
        window.location.href = ROUTE_PATH.HOME;
      });
  };

  // 容器挂载 + 布局后再跑分页（transformText 依赖真实 clientWidth/Height）
  if (id) requestAnimationFrame(() => loadBook(id));

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
                    return p > 0 ? `${t('modelDownloading')} ${p}%` : t('modelEnhancing');
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
      );

  // ── 桌面：双列 + 上/下页按钮 ──────────────────────────────────────────────
  const desktopLayout = (): ElementBuilder =>
    Div()
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
              .children(renderMobileBookDetailOperate(), enhanceArea()),
            Div()
              .class('wr-reader-page-indicator')
              .text(() => `${pageNum() + 1} / ${tree().totalPage + 1}`),
          ),
      );
  };

  return getDevice() === DEVICE_ENUM.MOBILE ? mobileLayout() : desktopLayout();
};
