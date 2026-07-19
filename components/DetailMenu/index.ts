import 'ranui/input';
import 'ranui/icon';
import { debounce, getMatchingSentences } from 'ranuts/utils';
import { Div, For, Show, Span, View, signal } from 'ranui/builder';
import { getTextSyntaxTree, setPageNum } from '@/lib/subscribe';
import { trim } from '@/lib/transformText';
import { renderCatalogue } from '@/components/Catalogue';
import { t } from '@/locales';
import type { ElementBuilder } from 'ranui/builder';
import type { TextSyntaxTree } from '@/lib/transformText';

interface SearchResultItem {
  text: { pre: string; value: string; next: string; index: number }[];
  index: number;
  title: string;
}

const INPUT_CSS_VARS: Record<string, string> = {
  '--ran-input-border-radius': '2rem',
  '--ran-input-content-border-radius': '2rem',
  '--ran-input-content-padding': '10px',
  '--ran-input-content-font-size': '14px',
  '--ran-input-content-font-weight': '400',
  '--ran-icon-font-size': '16px',
  '--ran-icon-color': 'var(--icon-color-1)',
  '--ran-icon-margin': '2px 0px 0px 12px',
  '--ran-input-background-color': 'rgba(13,20,30,.04)',
  '--ran-input-content-background-color': 'transparent',
  '--ran-input-border': 'none',
};

const EMPTY_ICON_FONT_SIZE = '60px';

/** 在语法树里按关键词逐页匹配，聚合成按章节分组的搜索结果。 */
const searchTree = (tree: TextSyntaxTree, keyword: string): SearchResultItem[] => {
  const { pageText = [], pageTitleId = [], titleIdTitle = [] } = tree || {};
  const result: SearchResultItem[] = [];
  pageText.forEach((item, index) => {
    if (!item.text.includes(keyword)) return;
    const textList = getMatchingSentences(item.text, keyword).map((str: string) => {
      const [pre, next] = str.split(keyword);
      return { pre, value: keyword, next, index };
    });
    const title = titleIdTitle[pageTitleId[index]];
    const existing = result.find((i) => i.title === title);
    if (existing) {
      existing.text.push(...textList);
    } else {
      result.push({ text: textList, index, title });
    }
  });
  return result;
};

/** 构建单条搜索结果分组（item-index 承载页码，供委托点击读取）。 */
const buildResultGroup = (item: SearchResultItem): ElementBuilder =>
  Div()
    .attr('item-index', `${item.index}`)
    .children(
      Div().class('wr-menu-result-title').text(item.title),
      ...item.text.map(({ pre, value, next, index }) =>
        Div()
          .class('wr-menu-result-line')
          .attr('item-index', `${index}`)
          .children(pre, Span().class('wr-menu-result-hit').text(value), next),
      ),
    );

const buildEmpty = (): ElementBuilder =>
  Div()
    .class('wr-menu-empty')
    .children(
      View('r-icon').attr('name', 'without-content').cssVar('--ran-icon-font-size', EMPTY_ICON_FONT_SIZE),
      Div().class('wr-menu-empty-text').text(t('no_result')),
    );

/**
 * 书内菜单：搜索框（原生 `change`，防抖 500ms）+ 目录 / 搜索结果切换。
 * 有输入时展示按章节分组的命中，`item-index` 委托点击跳页；无输入回落到目录。
 * 必须在 `createRoot` 作用域内调用。
 */
export const renderBookDetailMenu = (): ElementBuilder => {
  const [showSearchResult, setShowSearchResult] = signal(false);
  const [searchResult, setSearchResult] = signal<SearchResultItem[]>([]);
  const onSearch = debounce((e: Event): void => {
    const searchValue = trim((e.target as HTMLInputElement)?.value || '');
    if (!searchValue) {
      setShowSearchResult(false);
      return;
    }
    setShowSearchResult(true);
    setSearchResult(searchTree(getTextSyntaxTree(), searchValue));
  }, 500);

  const onSearchResult = (e: Event): void => {
    const index = (e.target as HTMLElement)?.getAttribute('item-index');
    if (!index) return;
    setPageNum(Number(index));
  };

  return Div()
    .class('wr-menu')
    .children(
      Div()
        .class('wr-menu-search')
        .children(
          View('r-input')
            .attr('icon', 'search')
            .attr('placeholder', t('search'))
            .style(INPUT_CSS_VARS)
            .on('change', onSearch),
        ),
      // 目录常驻构建（保留其滚动/响应式），随搜索态切换显隐。
      renderCatalogue().style('display', () => (showSearchResult() ? 'none' : 'flex')),
      // 搜索结果：Show 切换空/非空，For 按分组 keyed 复用；点击 item-index 委托跳页。
      Div()
        .class('wr-menu-result')
        .on('click', onSearchResult)
        .style('display', () => (showSearchResult() ? 'block' : 'none'))
        .children(
          Show({
            when: () => searchResult().length > 0,
            children: () =>
              For({
                each: () => searchResult(),
                key: (item) => item.index,
                render: (item) => buildResultGroup(item),
              }),
            fallback: () => buildEmpty(),
          }),
        ),
    );
};
