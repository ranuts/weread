import 'ranui/icon';
import { Div, View, createEffect, createRef, signal } from 'ranui/builder';
import { EVENT_NAME, getCurrentBookDetail, getTextSyntaxTree, setPageNum, syncHook } from '@/lib/subscribe';
import { fromStore } from '@/lib/reactive';
import { SORT_DIRECTION } from '@/lib/enums';
import type { ElementBuilder } from 'ranui/builder';
import type { TextSyntaxTree } from '@/lib/transformText';

const SORT_ICON_FONT_SIZE = '20px';

/**
 * 目录项点击（委托）：读 `title`（章节 index）→ titleIdPage 换算页码 →
 * `setPageNum`（包 View Transition）→ 关闭浮层。契约同原实现。
 */
const toPage = (e: Event): void => {
  const index = (e.target as HTMLElement)?.getAttribute('title');
  if (!index) return;
  const page = getTextSyntaxTree()?.titleIdPage[index];
  if (page !== undefined) {
    if (!document.startViewTransition) {
      setPageNum(page);
    } else {
      document.startViewTransition(() => setPageNum(page));
    }
  }
  syncHook.call(EVENT_NAME.CLOSE_POPOVER);
};

/** 由语法树构建目录条目列表（title 属性承载章节 index，供委托点击读取）。 */
const buildItems = (tree: TextSyntaxTree): ElementBuilder[] =>
  (tree?.titleIdTitle ?? []).map((item, index) =>
    Div()
      .class('wr-catalogue-item')
      .attr('title', `${index}`)
      .children(Div().class('wr-catalogue-item-inner').attr('title', `${index}`).text(item)),
  );

/**
 * 目录：书籍信息头 + 排序按钮 + 可滚动章节列表。
 * 列表随 `SET_TEXT_SYNTAX_TREE` 响应式重建（数据从 IndexedDB 异步加载后填充）。
 * 必须在 `createRoot` 作用域内调用。
 */
export const renderCatalogue = (): ElementBuilder => {
  const bookDetail = fromStore(getCurrentBookDetail, EVENT_NAME.SET_CURRENT_BOOK_DETAIL);
  const tree = fromStore(getTextSyntaxTree, EVENT_NAME.SET_TEXT_SYNTAX_TREE);

  const scrollRef = createRef<HTMLDivElement>();
  const [sortDirection, setSortDirection] = signal(SORT_DIRECTION.DOWN);

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

  // 语法树到位后重建目录条目（首帧 el 尚未 build，跳过；store 更新后填充）。
  createEffect(() => {
    const items = buildItems(tree());
    const el = scrollRef.current;
    if (!el) return;
    el.replaceChildren(...items.map((b) => b.build()));
  });

  return Div()
    .class('wr-catalogue')
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
        .on('click', toSort)
        .children(
          View('r-icon')
            .class(() => `hover-icon wr-catalogue-sort-icon ${sortDirection()}`)
            .attr('name', 'sort')
            .cssVar('--ran-icon-font-size', SORT_ICON_FONT_SIZE),
        ),
      Div()
        .class('wr-catalogue-list')
        .ref(scrollRef)
        .on('click', toPage)
        .children(...buildItems(tree())),
    );
};
