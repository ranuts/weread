import 'ranui/icon';
import 'ranui/progress';
import 'ranui/loading';
import { getQuery } from 'ranuts/utils';
import { Div, Span, View, createRef, onCleanup, signal } from 'ranui/builder';
import { getBookById } from '@/store/books';
import { detectChaptersByModel, hasModelForLang, resolveBookChapters } from '@/store/chapters';
import { canAutoEnhance, prefetchModelsForLangs, uiLang } from '@/lib/nlp/modelCache';
import { CLASSIFY_STATUS } from '@/lib/nlp/protocol';
import { clearChapterEditContext, setChapterEditContext } from '@/lib/chapterEdit';
import { transformTextToExpectedFormat } from '@/lib/transformText';
import { fromStore } from '@/lib/reactive';
import {
  EVENT_NAME,
  getCurrentBookDetail,
  getPageNum,
  getTextSyntaxTree,
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
  // 章节自动识别（模型增强）状态经共享 store 上报，目录模块就地显 loading / 手动入口。
  let enhancing = false; // 重入保护

  const containerRef = createRef<HTMLDivElement>(); // book-info morph 目标
  const showContainerRef = createRef<HTMLDivElement>(); // 分页测量容器
  const contentRef: { current: ArrayBuffer | Uint8Array<ArrayBuffer> | null } = { current: null };

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
      setChapterDetect({ status: 'idle', phase: 'download', progress: 0 });
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
    setTextSyntaxTree(transformTextToExpectedFormat({ content, title, container: el, chapters }));
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
          // 自动目录：分页已同步出好（reader 立即可读，整本一章）。无缓存(pending) → 交给模型识别
          // （唯一路径），目录里显 loading；模型推理在 nlp worker，不冻结 reader。
          if (bookChapters.source === 'pending') {
            if (hasModelForLang(bookChapters.lang)) {
              // 网络允许（已缓存/非省流量）就直接下模型跑，否则目录显「识别章节」手动按钮
              canAutoEnhance(bookChapters.lang).then((ok) => {
                if (ok) void runDetect();
                else setChapterDetect({ status: 'available', phase: 'download', progress: 0 });
              });
            } else {
              // 该语言无模型 → 无法自动识别，保持整本一章
              setChapterDetect({ status: 'idle', phase: 'download', progress: 0 });
            }
          } else {
            // 已有缓存(model/manual/caption) → 目录即终态
            setChapterDetect({ status: 'idle', phase: 'download', progress: 0 });
          }
        });
      })
      .catch(() => {
        window.location.href = ROUTE_PATH.HOME;
      });
  };

  // 打开阅读页即后台预取本地语言的章节模型（经 SW / 浏览器缓存），让「无感自动目录」尽量秒开；
  // 省流量/慢网/显式关闭时自动跳过（见 modelCache.networkAllowsDownload）。
  prefetchModelsForLangs([uiLang()]);
  // 容器挂载 + 布局后再跑分页（transformText 依赖真实 clientWidth/Height）
  if (id) requestAnimationFrame(() => loadBook(id));
  // 目录里「识别章节」按钮的手动出口（省流量/慢网场景）→ 跑一次模型识别
  const onRunEnhance = (): void => void runDetect();
  syncHook.tap(EVENT_NAME.RUN_ENHANCE, onRunEnhance);
  onCleanup(() => {
    clearChapterEditContext(); // 清理目录编辑上下文，避免下一本书误用
    syncHook.off(EVENT_NAME.RUN_ENHANCE, onRunEnhance);
    setChapterDetect({ status: 'idle', phase: 'download', progress: 0 }); // 复位共享状态
  });

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
