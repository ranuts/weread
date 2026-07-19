import 'ranui/icon';
import 'ranui/loading';
import { Div, Index, Show, Span, View, createEffect, createRef, onCleanup, signal } from 'ranui/builder';
import {
  EVENT_NAME,
  getChapterDetect,
  getCurrentBookDetail,
  getPageNum,
  getTextSyntaxTree,
  setPageNum,
  syncHook,
} from '@/lib/subscribe';
import { fromStore } from '@/lib/reactive';
import { SORT_DIRECTION } from '@/lib/enums';
import { deleteChapter, editableCount, renameChapter } from '@/lib/chapterEdit';
import { t } from '@/locales';
import type { ElementBuilder } from 'ranui/builder';

const SORT_ICON_FONT_SIZE = '20px';
const EDIT_ICON_FONT_SIZE = '18px';

/**
 * 目录项点击（委托）：读 `title`（章节 index）→ titleIdPage 换算页码 →
 * `setPageNum`（包 View Transition）→ 关闭浮层。契约同原实现。
 */
const toPage = (titleId: string): void => {
  const page = getTextSyntaxTree()?.titleIdPage[titleId];
  if (page !== undefined) {
    if (!document.startViewTransition) {
      setPageNum(page);
    } else {
      document.startViewTransition(() => setPageNum(page));
    }
  }
  syncHook.call(EVENT_NAME.CLOSE_POPOVER);
};

/** 就地重命名：把某条 item-inner 变 contenteditable、全选、blur/Enter 提交给 renameChapter。 */
const startRename = (inner: HTMLElement): void => {
  inner.setAttribute('contenteditable', 'plaintext-only');
  inner.focus();
  const range = document.createRange();
  range.selectNodeContents(inner);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
  const commit = (): void => {
    inner.removeAttribute('contenteditable');
    renameChapter(Number(inner.getAttribute('title')), inner.textContent ?? '');
  };
  inner.addEventListener('blur', commit, { once: true });
  inner.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      inner.blur();
    } else if (e.key === 'Escape') {
      inner.textContent = getTextSyntaxTree()?.titleIdTitle[Number(inner.getAttribute('title'))] ?? inner.textContent;
      inner.blur();
    }
  });
};

/**
 * 目录：书籍信息头 + 排序/编辑按钮 + 可滚动章节列表。
 * 章节列表用 `Index`（按位置 keyed）随 `SET_TEXT_SYNTAX_TREE` 就地更新，`title` 属性承载章节 index。
 * 编辑态（铅笔切换）下：每项显删除 ×、点标题就地重命名；非编辑态正常导航。
 * 必须在 `createRoot` 作用域内调用。
 */
export const renderCatalogue = (): ElementBuilder => {
  const bookDetail = fromStore(getCurrentBookDetail, EVENT_NAME.SET_CURRENT_BOOK_DETAIL);
  const tree = fromStore(getTextSyntaxTree, EVENT_NAME.SET_TEXT_SYNTAX_TREE);
  const pageNum = fromStore(getPageNum, EVENT_NAME.SET_CURRENT_BOOK_PAGE);
  // 章节自动识别状态（阅读页共享）：detecting 显进度圈、available 显手动按钮。
  const detect = fromStore(getChapterDetect, EVENT_NAME.SET_CHAPTER_DETECT);

  const scrollRef = createRef<HTMLDivElement>();
  const [sortDirection, setSortDirection] = signal(SORT_DIRECTION.DOWN);

  /** 当前页所属章节的 titleId（= 目录项下标），无则 -1。 */
  const activeTitleId = (): number => tree().pageTitleId?.[pageNum()] ?? -1;

  const scrollActiveIntoView = (): void => {
    const el = scrollRef.current?.querySelector('.wr-catalogue-item.is-active') as HTMLElement | null;
    el?.scrollIntoView({ block: 'center' });
  };

  // 目录可见时，翻页保持当前章在视口内。
  createEffect(() => {
    activeTitleId(); // 订阅：页码/语法树变化即重算
    if (scrollRef.current?.offsetParent) scrollActiveIntoView();
  });
  // 目录进入视口（浮层打开）时，滚动到当前章。
  if (typeof IntersectionObserver !== 'undefined') {
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) scrollActiveIntoView();
    });
    requestAnimationFrame(() => scrollRef.current && io.observe(scrollRef.current));
    onCleanup(() => io.disconnect());
  }
  const [editing, setEditing] = signal(false);

  const toSort = (): void => {
    const el = scrollRef.current;
    if (!el) return;
    if (sortDirection() === SORT_DIRECTION.DOWN) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
      setSortDirection(SORT_DIRECTION.UP);
    } else {
      el.scrollTo({ top: 0, behavior: 'smooth' });
      setSortDirection(SORT_DIRECTION.DOWN);
    }
  };

  // 列表委托点击：编辑态下删除/重命名并阻止导航；否则正常跳页。
  const onListClick = (e: Event): void => {
    const target = e.target as HTMLElement;
    const del = target.closest?.('.wr-catalogue-del') as HTMLElement | null;
    if (del) {
      deleteChapter(Number(del.getAttribute('data-tid')));
      return;
    }
    const inner = target.closest?.('.wr-catalogue-item-inner') as HTMLElement | null;
    if (!inner) return;
    if (editing()) {
      startRename(inner);
    } else {
      toPage(inner.getAttribute('title') ?? '');
    }
  };

  return Div()
    .class(() => `wr-catalogue ${editing() ? 'editing' : ''}`)
    .children(
      Div()
        .class('wr-catalogue-header')
        .children(
          View('img')
            .class('wr-catalogue-cover')
            .attr('src', () => bookDetail().image ?? '')
            .style('display', () => (bookDetail().image ? '' : 'none')),
          Div().children(
            Div().class('wr-catalogue-title').text(() => bookDetail().title ?? ''),
            Div().class('wr-catalogue-author').text(() => bookDetail().author ?? ''),
          ),
        ),
      Div()
        .class('wr-catalogue-sort')
        .children(
          // 编辑切换：仅在有可编辑章节时显示
          View('r-icon')
            .class(() => `hover-icon wr-catalogue-edit ${editing() ? 'active' : ''}`)
            .attr('name', 'setting')
            .attr('title', t('edit_catalogue'))
            .style('display', () => (editableCount() > 0 ? '' : 'none'))
            .cssVar('--ran-icon-font-size', EDIT_ICON_FONT_SIZE)
            .on('click', () => setEditing(!editing())),
          View('r-icon')
            .class(() => `hover-icon wr-catalogue-sort-icon ${sortDirection()}`)
            .attr('name', 'sort')
            .cssVar('--ran-icon-font-size', SORT_ICON_FONT_SIZE)
            .on('click', toSort),
        ),
      // 章节自动识别状态条：识别中显进度圈；省流量场景显手动「识别更多章节」按钮。
      Show({
        when: () => detect().status === 'detecting',
        children: () =>
          Div()
            .class('wr-catalogue-detect')
            .children(
              View('r-loading')
                .attr('name', 'circle-fold')
                .cssVar('--loading-circle-fold-item-before-background', 'var(--ran-color-primary)'),
              Span()
                .class('wr-catalogue-detect-text')
                .text(() => {
                  const d = detect();
                  // 统一友好文案「分析章节中」，不暴露"下载模型/推理"等专业词；带进度百分比。
                  return d.progress > 0 ? `${t('analyzingChapters')} ${d.progress}%` : t('analyzingChapters');
                }),
            ),
      }),
      Show({
        when: () => detect().status === 'available',
        children: () =>
          Div()
            .class('wr-catalogue-detect')
            .children(
              View('a')
                .class('wr-catalogue-detect-btn')
                .attr('title', t('enhanceHint'))
                .text(t('enhanceCatalogue'))
                .on('click', () => syncHook.call(EVENT_NAME.RUN_ENHANCE)),
            ),
      }),
      Div()
        .class('wr-catalogue-list')
        .ref(scrollRef)
        .on('click', onListClick)
        .children(
          Index({
            each: () => tree().titleIdTitle ?? [],
            render: (title, i) =>
              Div()
                .class(() => `wr-catalogue-item${i === activeTitleId() ? ' is-active' : ''}`)
                .attr('title', `${i}`)
                .children(
                  Div().class('wr-catalogue-item-inner').attr('title', `${i}`).text(title),
                  View('r-icon')
                    .class('wr-catalogue-del')
                    .attr('name', 'close')
                    .attr('title', t('delete_chapter'))
                    .attr('data-tid', `${i}`)
                    .cssVar('--ran-icon-font-size', EDIT_ICON_FONT_SIZE),
                ),
          }),
        ),
    );
};
