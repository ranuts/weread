import 'ranui/input';
import 'ranui/icon';
import 'ranui/loading';
import 'ranui/theme-switch';
import { debounce } from 'ranuts/utils';
import { Div, For, Match, Show, Span, Switch, View, signal } from 'ranui/builder';
import {
  addBook,
  getAllBooks,
  searchBooksByAuthor,
  searchBooksByContent,
  searchBooksByTitle,
} from '@/store/books';
import { resumeDB } from '@/store';
import { checkEncoding, createReader, trim } from '@/lib/transformText';
import { BOOKS_ADD_BY_DEFAULT, ensampleConfigs } from '@/lib/ensample';
import { renderBookCard } from '@/components/BookCard';
import { ROUTE_PATH } from '@/router';
import { t } from '@/locales';
import type { Child, ElementBuilder } from 'ranui/builder';
import type { BookInfo, SearchResult } from '@/store/books';
import type { EnBook } from '@/lib/ensample';

export interface PageOptions {
  /** 服务端渲染时只出外壳（不碰 window/DB），数据在 client 从 IndexedDB 加载 */
  ssr?: boolean;
}

const INPUT_CSS_VARS: Record<string, string> = {
  '--ran-input-border-radius': '2rem',
  '--ran-input-content-border-radius': '2rem',
  '--ran-input-content-padding': '10px',
  '--ran-input-content-font-size': '16px',
  '--ran-input-content-font-weight': '400',
  '--ran-icon-font-size': '20px',
  '--ran-icon-color': 'var(--icon-color-1)',
  '--ran-icon-margin': '4px 0px 0px 16px',
};

const PLUS_ICON_FONT_SIZE = '56px';
const EMPTY_ICON_FONT_SIZE = '96px';

/** 选文件 → 读取 → checkEncoding → addBook。契约同原实现。 */
const addBookByFile = (): Promise<BookInfo> =>
  new Promise((resolve, reject) => {
    const uploadFile = document.createElement('input');
    uploadFile.setAttribute('type', 'file');
    uploadFile.click();
    uploadFile.onchange = (): void => {
      const [file] = uploadFile.files ?? [];
      if (!file) return;
      createReader(file).then((result) => {
        addBook({ title: file.name, encoding: checkEncoding(new Uint8Array(result)), content: result }).then((res) => {
          res.error ? reject(res.error) : resolve(res.data as BookInfo);
        });
      });
    };
  });

/** 拉取内置书 URL → 读取 → addBook（默认书 seeding 用）。 */
const addBookByUrl = ({ url, title, image, author }: EnBook): Promise<BookInfo> =>
  new Promise((resolve, reject) => {
    fetch(url).then((response) => {
      response.blob().then((blob) => {
        const file = new File([blob], title, { type: blob.type });
        createReader(file).then((result) => {
          addBook({
            title: file.name,
            encoding: checkEncoding(new Uint8Array(result)),
            content: result,
            image,
            author,
          }).then((res) => {
            res.error ? reject(res.error) : resolve(res.data as BookInfo);
          });
        });
      });
    });
  });

/** 关键词高亮：按 term 切分，命中片段包 `<span class="wr-home-hit">`。 */
const highlight = (text: string, term: string): (ElementBuilder | string)[] => {
  if (!term) return [text];
  const parts = text.split(term);
  const out: (ElementBuilder | string)[] = [];
  parts.forEach((p, i) => {
    out.push(p);
    if (i < parts.length - 1) out.push(Span().class('wr-home-hit').text(term));
  });
  return out;
};

/** 单条搜索结果行（item-id 承载书 id，供委托点击读取）。 */
const resultRow = (book: BookInfo, term: string, extra?: ElementBuilder): ElementBuilder =>
  Div()
    .class('wr-home-result-row')
    .attr('item-id', book.id)
    .children(
      book.image ? View('img').class('wr-home-result-cover').attr('src', book.image) : null,
      Div()
        .class('wr-home-result-meta')
        .children(
          Div().class('wr-home-result-title').children(...highlight(book.title ?? '', term)),
          Div().class('wr-home-result-author').text(book.author ?? ''),
          extra,
        ),
    );

/**
 * 首页（书架）：`<r-input>` 搜索（防抖 500ms，三路并行 worker 搜索）+ 面板高度 signal
 * 动画；`<r-card>` 书架栅格（`For` 按 book.id keyed）+ "+" 导入；默认书一次性 seeding；
 * `item-id` 委托导航；`<r-theme-switch>`。单份响应式（CSS 断点）。SSR 只出外壳。
 * 必须在 `createRoot` 作用域内调用。
 */
export const renderHome = (opts: PageOptions = {}): ElementBuilder => {
  const [bookList, setBookList] = signal<BookInfo[]>([]);
  const [searchValue, setSearchValue] = signal('');
  const [searchLoading, setSearchLoading] = signal(false);
  const [titleResult, setTitleResult] = signal<BookInfo[]>([]);
  const [authorResult, setAuthorResult] = signal<BookInfo[]>([]);
  const [contentResult, setContentResult] = signal<SearchResult[]>([]);

  const clearResults = (): void => {
    setTitleResult([]);
    setAuthorResult([]);
    setContentResult([]);
  };

  const loadBooks = (): void => {
    getAllBooks<BookInfo>()
      .then((res) => {
        if (!res.error) setBookList(res.data);
        else resumeDB().then(loadBooks);
      })
      .catch(() => resumeDB().then(loadBooks));
  };

  const add = (): void => {
    addBookByFile().then((book) => setBookList([...bookList(), book]));
  };

  const onChange = debounce((e: Event): void => {
    const value = trim((e.target as HTMLInputElement)?.value || '');
    setSearchValue(value);
    if (!value) {
      setSearchLoading(false);
      return;
    }
    setSearchLoading(true);
    clearResults();
    // 三路并行 worker 搜索：标题 / 作者 / 内容（各分页 3 条）
    Promise.all([
      searchBooksByTitle<BookInfo>(value).then((r) => !r.error && setTitleResult(r.data)),
      searchBooksByAuthor<BookInfo>(value).then((r) => !r.error && setAuthorResult(r.data)),
      searchBooksByContent<SearchResult>(value).then((r) => !r.error && setContentResult(r.data)),
    ]).finally(() => setSearchLoading(false));
  }, 500);

  const onResultClick = (e: Event): void => {
    const id = (e.target as HTMLElement).closest?.('[item-id]')?.getAttribute('item-id');
    if (id) window.location.href = `${ROUTE_PATH.BOOK_DETAIL}?id=${id}`;
  };

  // 客户端副作用：默认书一次性 seeding + 从 IndexedDB 加载书架。
  if (!opts.ssr) {
    if (!localStorage.getItem(BOOKS_ADD_BY_DEFAULT)) {
      ensampleConfigs.forEach((config) => {
        addBookByUrl(config).then((book) => setBookList([...bookList(), book]));
      });
      localStorage.setItem(BOOKS_ADD_BY_DEFAULT, 'true');
    }
    loadBooks();
  }

  const hasResults = (): boolean =>
    titleResult().length > 0 || authorResult().length > 0 || contentResult().length > 0;

  const bookGroup = (label: string, each: () => BookInfo[]): Child =>
    Show({
      when: () => each().length > 0,
      children: () =>
        Div()
          .class('wr-home-result-group')
          .children(
            Div().class('wr-home-result-label').text(label),
            For({ each, key: (b) => b.id, render: (b) => resultRow(b, searchValue()) }),
          ),
    });

  return Div()
    .class('wr-home')
    .children(
      // 顶栏：主题切换（ranui alpha.4 起 r-theme-switch SSR-safe）
      Div().class('wr-home-topbar').children(View('r-theme-switch')),
      // 搜索区
      Div()
        .class('wr-home-search')
        .children(
          View('r-input')
            .class('wr-home-input')
            .attr('icon', 'search')
            .attr('placeholder', t('search'))
            .style(INPUT_CSS_VARS)
            .on('change', onChange),
          // 搜索面板：高度随 searchValue 动画（signal → .style）
          Div()
            .class('wr-home-panel')
            .style('height', () => (searchValue() ? 'calc(100vh - 12rem)' : '0px'))
            .on('click', onResultClick)
            .children(
              Switch({
                fallback: () =>
                  Div()
                    .class('wr-home-empty')
                    .children(
                      View('r-icon').attr('name', 'without-content').cssVar('--ran-icon-font-size', EMPTY_ICON_FONT_SIZE),
                      Div().class('wr-home-empty-text').text(t('no_result')),
                    ),
                children: [
                  Match({
                    when: () => searchLoading(),
                    children: () =>
                      Div()
                        .class('wr-home-loading')
                        .children(
                          View('r-loading')
                            .attr('name', 'circle-fold')
                            .cssVar('--loading-circle-fold-item-before-background', 'var(--ran-color-primary)'),
                        ),
                  }),
                  Match({
                    when: hasResults,
                    children: () =>
                      Div()
                        .class('wr-home-results')
                        .children(
                          bookGroup(t('ebook'), titleResult),
                          bookGroup(t('ebook'), authorResult),
                          Show({
                            when: () => contentResult().length > 0,
                            children: () =>
                              Div()
                                .class('wr-home-result-group')
                                .children(
                                  Div()
                                    .class('wr-home-result-label')
                                    .text(`${t('search_result_1')} ${contentResult().length}`),
                                  For({
                                    each: () => contentResult(),
                                    key: (b) => b.id,
                                    render: (b) => {
                                      const [str = ''] = b.matchedText ?? [];
                                      return resultRow(
                                        b,
                                        searchValue(),
                                        Div().class('wr-home-result-snippet').children(...highlight(str, searchValue())),
                                      );
                                    },
                                  }),
                                ),
                          }),
                        ),
                  }),
                ],
              }),
            ),
        ),
      // 书架：搜索时隐藏
      Show({
        when: () => !searchValue(),
        children: () =>
          Div()
            .class('wr-home-shelf')
            .children(
              Div().class('wr-home-shelf-title').text(t('my_bookcase')),
              Div()
                .class('wr-home-grid')
                .children(
                  // "+" 导入卡
                  Div()
                    .class('wr-home-add')
                    .on('click', add)
                    .children(View('r-icon').attr('name', 'plus').cssVar('--ran-icon-font-size', PLUS_ICON_FONT_SIZE)),
                  // 书架栅格：For 按 book.id keyed 复用卡片
                  For({ each: () => bookList(), key: (b) => b.id, render: (b) => renderBookCard(b) }),
                ),
            ),
      }),
    );
};
