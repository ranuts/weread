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
 * 精选编辑感封面色板：低饱和、深色调、白字可读——刻意避开满饱和随机 HSL（那是 AI slop）。
 * 每项为 [浅, 深] 两端，配合 CSS 里的顶部柔光 + 内描边书框，做出"精装书"质感。
 */
const COVER_PALETTE: ReadonlyArray<readonly [string, string]> = [
  ['#3d4c66', '#26324a'], // 靛蓝板岩
  ['#7a3b44', '#4d222b'], // 酒红
  ['#2f5248', '#1c332c'], // 森绿
  ['#8a5a33', '#573620'], // 赭石
  ['#4b4459', '#2e2937'], // 灰紫
  ['#33565e', '#1e3940'], // 深青
  ['#6d4a59', '#432a36'], // 木槿
  ['#4d5a3f', '#313a28'], // 橄榄
];

/** 标题稳定哈希 → 色板下标，保证同名书永远同色、整架分布均匀。 */
const paletteFromString = (str: string): readonly [string, string] => {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return COVER_PALETTE[h % COVER_PALETTE.length];
};

/** 无封面书的生成式封面：精选双色 + 竖排书脊光泽 + typeset 标题/作者。 */
const generatedCover = (title: string, author: string): ElementBuilder => {
  const [a, b] = paletteFromString(title || author || 'book');
  return Div()
    .class('wr-cover wr-cover-generated')
    .style({ '--cover-a': a, '--cover-b': b })
    .children(
      Div().class('wr-cover-spine'),
      Div()
        .class('wr-cover-plate')
        .children(
          Div().class('wr-cover-title').attr('title', title).text(title),
          Div().class('wr-cover-rule'),
          Div().class('wr-cover-author').text(author),
        ),
      Div().class('wr-cover-shine'),
    );
};

/**
 * 书架卡片：一张「书」——有封面用封面，无封面生成渐变书封（typeset 标题/作者）。
 * 点击清空阅读态并整页跳转书详情，支持时用 View Transition 做 `book-info-${id}` 共享元素 morph。
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

  const cover = image
    ? Div()
        .class('wr-cover')
        .children(
          View('img').class('wr-cover-img').attr('src', image).attr('alt', title),
          Div().class('wr-cover-spine'),
          Div().class('wr-cover-shine'),
        )
    : generatedCover(title, author);

  return View<HTMLAnchorElement>('a')
    .ref(ref)
    .class('wr-book-card')
    .attr('href', href)
    .style('view-transition-name', `book-info-${id}`)
    .on('click', toDetail)
    .children(
      cover,
      Div()
        .class('wr-book-card-meta')
        .children(
          Div().class('wr-book-card-title truncate').attr('title', title).text(title),
          Div().class('wr-book-card-author truncate').attr('title', author).text(author),
        ),
    );
};
