import 'ranui/input';
import 'ranui/icon';
import 'ranui/loading';
import 'ranui/theme-switch';
import { Modal } from 'ranui/modal';
import { debounce } from 'ranuts/utils';
import { Div, For, Match, Show, Span, Switch, View, createEffect, createRef, onCleanup, signal } from 'ranui/builder';
import {
  addBook,
  deleteBook,
  getAllBooks,
  searchBooksByAuthor,
  searchBooksByContent,
  searchBooksByTitle,
} from '@/store/books';
import { resumeDB } from '@/store';
import { checkEncoding, createReader, trim } from '@/lib/transformText';
import { BOOKS_ADD_BY_DEFAULT, ensampleConfigs } from '@/lib/ensample';
import { renderBookCard } from '@/components/BookCard';
import { getAllProgress } from '@/store/progress';
import type { ReadingProgress } from '@/store/progress';
import { prefetchModelsForLangs, uiLang } from '@/lib/nlp/modelCache';
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
  // 高度 = 文本行 + 上下各 16px 对称内边距，文本由此「按构造」垂直居中，
  // 不依赖 r-input 内部行的 flex 对齐（之前用 height/min-height 会让内部行顶对齐、
  // 文本骑高、和 "/" 芯片错位）。content-min-height:0 关掉默认 32px 的顶对齐留白。
  '--ran-input-content-padding': '16px 10px',
  '--ran-input-content-min-height': '0',
  '--ran-input-content-font-size': '16px',
  '--ran-input-content-font-weight': '400',
  '--ran-icon-font-size': '20px',
  '--ran-icon-color': 'var(--icon-color-1)',
  // 顶边距 0，图标不偏下（ranui 默认已 align-items:center，无需再声明）。
  '--ran-icon-margin': '0px 0px 0px 16px',
};

const PLUS_ICON_FONT_SIZE = '34px';
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
  const [progress, setProgress] = signal<Record<string, ReadingProgress>>({}); // 书架阅读进度（id → 进度）
  const [searchValue, setSearchValue] = signal('');
  const [searchLoading, setSearchLoading] = signal(false);
  const [titleResult, setTitleResult] = signal<BookInfo[]>([]);
  const [authorResult, setAuthorResult] = signal<BookInfo[]>([]);
  const [contentResult, setContentResult] = signal<SearchResult[]>([]);
  const inputRef = createRef<HTMLInputElement & { value: string }>();
  const panelRef = createRef<HTMLDivElement>();
  const [selected, setSelected] = signal(0); // 键盘选中的结果行下标

  /** 当前搜索面板里的所有可选结果行（DOM 顺序 = 展示顺序）。 */
  const resultRows = (): HTMLElement[] =>
    Array.from(panelRef.current?.querySelectorAll('.wr-home-result-row') ?? []) as HTMLElement[];

  /** 打开选中项（越界回落第一条），整页跳转书详情。 */
  const openSelected = (): void => {
    const rows = resultRows();
    const id = (rows[selected()] ?? rows[0])?.getAttribute('item-id');
    if (id) window.location.href = `${ROUTE_PATH.BOOK_DETAIL}?id=${id}`;
  };

  const clearResults = (): void => {
    setTitleResult([]);
    setAuthorResult([]);
    setContentResult([]);
  };

  const loadBooks = (): void => {
    getAllBooks<BookInfo>()
      .then((res) => {
        if (!res.error) {
          setBookList(res.data);
          getAllProgress().then(setProgress); // DB 就绪后再拉进度（书架进度条）
        } else resumeDB().then(loadBooks);
      })
      .catch(() => resumeDB().then(loadBooks));
  };

  const add = (): void => {
    addBookByFile().then((book) => setBookList([...bookList(), book]));
  };

  /** 删除书：modal 二次确认（不可撤销）→ 删书本体 + 章节缓存 → 从书架移除。 */
  const removeBook = async (bookId: string): Promise<void> => {
    const book = bookList().find((b) => b.id === bookId);
    const { action } = await Modal.confirm({
      title: t('delete_book_title'),
      content: t('delete_book_confirm', [book?.title ?? '']),
      okText: t('delete_book'),
      cancelText: t('cancel'),
    });
    if (action !== 'confirm') return;
    setBookList(bookList().filter((b) => b.id !== bookId));
    deleteBook(bookId).catch(() => loadBooks()); // 失败则重新拉取，保持与库一致
  };

  // 边打边搜：绑到 r-input 的 `input` 事件（每次按键触发），250ms 防抖压请求。
  const onChange = debounce((e: Event): void => {
    const value = trim((e.target as HTMLInputElement)?.value || '');
    setSearchValue(value);
    if (!value) {
      setSearchLoading(false);
      clearResults();
      return;
    }
    setSearchLoading(true);
    clearResults();
    setSelected(0); // 新搜索：高亮回到第一条
    // 三路并行 worker 搜索：标题 / 作者 / 内容（各分页 3 条）
    Promise.all([
      searchBooksByTitle<BookInfo>(value).then((r) => !r.error && setTitleResult(r.data)),
      searchBooksByAuthor<BookInfo>(value).then((r) => !r.error && setAuthorResult(r.data)),
      searchBooksByContent<SearchResult>(value).then((r) => !r.error && setContentResult(r.data)),
    ]).finally(() => setSearchLoading(false));
  }, 250);

  /** 清空搜索（Esc / 结果外点）：清输入框值 + 复位所有搜索信号，露出书架。 */
  const clearSearch = (): void => {
    if (inputRef.current) inputRef.current.value = '';
    setSearchValue('');
    setSearchLoading(false);
    clearResults();
  };

  /** 聚焦搜索框并全选（`/` 快捷键）。依赖 ranui ≥ 补了 r-input.focus() 的版本；
      旧版无 focus() 时可选链兜底为 no-op（升级 ranui 后即生效）。 */
  const focusSearch = (): void => {
    const el = inputRef.current as (HTMLElement & { select?: () => void }) | null;
    el?.focus?.();
    el?.select?.();
  };

  /** 全局快捷键：搜索态下 ↑/↓ 移动高亮、Enter 打开；`/` 聚焦搜索；`Esc` 清空退出。 */
  const onKey = (e: KeyboardEvent): void => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    // 搜索态：方向键/回车驱动结果导航（输入框聚焦时也生效）
    if (searchValue()) {
      const rows = resultRows();
      if (rows.length) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setSelected(Math.min(selected() + 1, rows.length - 1));
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setSelected(Math.max(selected() - 1, 0));
          return;
        }
        if (e.key === 'Enter') {
          e.preventDefault();
          openSelected();
          return;
        }
      }
    }
    const active = document.activeElement as HTMLElement | null;
    const typing =
      active?.tagName === 'INPUT' || active?.tagName === 'TEXTAREA' || active?.isContentEditable || active?.tagName === 'R-INPUT';
    if (e.key === '/' && !typing) {
      e.preventDefault();
      focusSearch();
    } else if (e.key === 'Escape' && searchValue()) {
      clearSearch();
      active?.blur?.();
    }
  };

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
    loadBooks(); // 书架 + 阅读进度（loadBooks 成功后拉进度）
    window.addEventListener('keydown', onKey);
    onCleanup(() => window.removeEventListener('keydown', onKey));
    // 高亮同步：selected 或结果变化后，把 .is-highlighted 落到第 selected 行并滚入视口。
    // rAF 等 For 重渲染 flush，避免命中旧节点。
    createEffect(() => {
      const sel = selected();
      void (titleResult().length + authorResult().length + contentResult().length); // 订阅结果变化
      requestAnimationFrame(() => {
        const rows = resultRows();
        rows.forEach((r, i) => r.classList.toggle('is-highlighted', i === sel));
        rows[sel]?.scrollIntoView({ block: 'nearest' });
      });
    });
    // 打开网页后空闲时后台预取本地语言的章节模型（经 SW 缓存），
    // 之后打开 none 书可秒开自动增强。省流量/慢网/显式关闭时自动跳过。
    prefetchModelsForLangs([uiLang()]);
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
      // 顶栏：品牌字标 + 主题切换（ranui alpha.4 起 r-theme-switch SSR-safe）
      Div()
        .class('wr-home-header')
        .children(
          Div()
            .class('wr-home-brand')
            .children(
              Div().class('wr-home-logo').text('W'),
              Div()
                .class('wr-home-wordmark')
                .children(
                  Div().class('wr-home-name').text('weread'),
                  Div().class('wr-home-tagline').text(t('tagline')),
                ),
            ),
          View('r-theme-switch'),
        ),
      // 搜索区
      Div()
        .class('wr-home-search')
        .children(
          // 输入框 + 右侧 "/" 快捷键提示芯片（聚焦时隐藏）
          Div()
            .class('wr-home-search-field')
            .children(
              View('r-input')
                .ref(inputRef)
                .class('wr-home-input')
                .attr('icon', 'search')
                .attr('placeholder', t('search'))
                .style(INPUT_CSS_VARS)
                .on('input', onChange),
              View('kbd').class('wr-home-kbd').attr('aria-hidden', 'true').text('/'),
            ),
          // 搜索面板：高度随 searchValue 动画（signal → .style）
          Div()
            .class('wr-home-panel')
            .ref(panelRef)
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
              Div()
                .class('wr-home-shelf-head')
                .children(
                  Div().class('wr-home-shelf-title').text(t('my_bookcase')),
                  Span()
                    .class('wr-home-shelf-count')
                    .text(() => t('library_count', [bookList().length])),
                ),
              Div()
                .class('wr-home-grid')
                .children(
                  // "+" 导入卡（虚线幽灵封面，尺寸与书封一致）——键盘可达（Enter/Space 触发）
                  Div()
                    .class('wr-home-add')
                    .attr('title', t('add_book'))
                    .attr('role', 'button')
                    .attr('tabindex', '0')
                    .attr('aria-label', t('add_book'))
                    .on('click', add)
                    .on('keydown', (e: Event) => {
                      const ke = e as KeyboardEvent;
                      if (ke.key === 'Enter' || ke.key === ' ') {
                        ke.preventDefault();
                        add();
                      }
                    })
                    .children(
                      Div()
                        .class('wr-home-add-inner')
                        .children(
                          View('r-icon').attr('name', 'plus').cssVar('--ran-icon-font-size', PLUS_ICON_FONT_SIZE),
                          Div().class('wr-home-add-label').text(t('add_book')),
                        ),
                    ),
                  // 书架栅格：For 按 book.id keyed 复用卡片
                  For({
                    each: () => bookList(),
                    key: (b) => b.id,
                    render: (b) => renderBookCard(b, removeBook, () => progress()[b.id]?.percent ?? 0),
                  }),
                ),
            ),
      }),
    );
};
