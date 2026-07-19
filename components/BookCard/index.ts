import 'ranui/card';
import { Div, View, batch, createRef } from 'ranui/builder';
import { setCurrentBookDetail, setPageNum, setTextSyntaxTree } from '@/lib/subscribe';
import { ROUTE_PATH } from '@/router';
import type { ElementBuilder } from 'ranui/builder';
import type { BookInfo } from '@/store/books';

/** 进入详情前清空阅读态三信号（页码 / 当前书 / 语法树），批处理一次刷新。 */
const clear = (): void => {
  batch(() => {
    setPageNum(0);
    setCurrentBookDetail({});
    setTextSyntaxTree({
      sequences: [],
      totalPage: 0,
      pageText: [],
      pageTitleId: [],
      titleIdTitle: [],
      titleIdPage: {},
    });
  });
};

/**
 * 书架卡片：`<r-card>`（封面 + 标题 + 作者）。点击清空阅读态并整页跳转书详情，
 * 支持时用 View Transition 做 `book-info-${id}` 共享元素 morph。响应式尺寸交由 CSS。
 */
export const renderBookCard = (book: BookInfo): ElementBuilder => {
  const { id, image, title = '', author = '' } = book || {};
  const ref = createRef<HTMLAnchorElement>();
  const href = `${ROUTE_PATH.BOOK_DETAIL}?id=${id}`;

  const toDetail = (e: Event): void => {
    e.preventDefault(); // 由 startViewTransition 接管导航，morph 才生效
    clear();
    if (document.startViewTransition) {
      ref.current?.style.setProperty('view-transition-name', `book-info-${id}`);
      document.startViewTransition(() => {
        ref.current?.style.setProperty('view-transition-name', '');
        window.location.href = href;
      });
    } else {
      window.location.href = href;
    }
  };

  return View<HTMLAnchorElement>('a')
    .ref(ref)
    .class('wr-book-card')
    .attr('href', href)
    .style('view-transition-name', `book-info-${id}`)
    .on('click', toDetail)
    .children(
      View('r-card')
        .class('wr-book-card-inner')
        .boolAttr('hoverable', true)
        .children(
          image ? View('img').class('wr-book-card-cover').attr('src', image).attr('alt', title) : null,
          Div()
            .class('wr-book-card-meta')
            .children(
              Div().class('wr-book-card-title truncate').attr('title', title).text(title),
              Div().class('wr-book-card-author truncate').attr('title', author).text(author),
            ),
        ),
    );
};
