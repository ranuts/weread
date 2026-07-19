import 'ranui/icon';
import { Div, Index, Show, Span, View } from 'ranui/builder';
import { EVENT_NAME, getBookNotes, getTextSyntaxTree, setBookNotes, setPageNum, syncHook } from '@/lib/subscribe';
import { fromStore } from '@/lib/reactive';
import { buildPageOffsets, pageForOffset } from '@/lib/notes/anchor';
import { deleteNote } from '@/store/notes';
import { t } from '@/locales';
import type { BookNote } from '@/store/notes';
import type { ElementBuilder, Getter } from 'ranui/builder';

const EMPTY_ICON_FONT_SIZE = '60px';
const DEL_ICON_FONT_SIZE = '16px';

/** 空态：无划线时的占位。 */
const buildEmpty = (): ElementBuilder =>
  Div()
    .class('wr-notes-empty')
    .children(
      View('r-icon').attr('name', 'book').cssVar('--ran-icon-font-size', EMPTY_ICON_FONT_SIZE),
      Div().class('wr-notes-empty-text').text(t('no_notes')),
    );

/**
 * 笔记面板：按创建顺序列出该书全部划线（高亮原文 + 想法），点击跳到所在页、× 删除。
 * 跳页用「可见文本」偏移换算（`pageForOffset`），与正文高亮同一坐标系。
 * 必须在 `createRoot` 作用域内调用。
 */
export const renderNotesPanel = (): ElementBuilder => {
  const notes = fromStore(getBookNotes, EVENT_NAME.SET_BOOK_NOTES);
  const tree = fromStore(getTextSyntaxTree, EVENT_NAME.SET_TEXT_SYNTAX_TREE);

  const jump = (note: BookNote): void => {
    const page = pageForOffset(buildPageOffsets(tree().pageText), note.start);
    if (document.startViewTransition) document.startViewTransition(() => setPageNum(page));
    else setPageNum(page);
    syncHook.call(EVENT_NAME.CLOSE_POPOVER);
  };

  const remove = (id: string): void => {
    void deleteNote(id).then(() => setBookNotes(notes().filter((n) => n.id !== id)));
  };

  // 用 Index（按位置复用节点 + item 为 getter），字段绑定全走 getter：改颜色/想法后面板即时反映
  // （For 按 key 复用会锁死首次快照，导致「先建划线后补想法」时想法不显示）。
  const buildItem = (note: Getter<BookNote>): ElementBuilder =>
    Div()
      .class('wr-notes-item')
      .children(
        Div()
          .class('wr-notes-item-main')
          .on('click', () => jump(note()))
          .children(
            Span()
              .class(() => `wr-notes-quote wr-mark-${note().color}`)
              .text(() => note().text),
            Show({
              when: () => !!note().thought,
              children: () =>
                Div()
                  .class('wr-notes-thought')
                  .text(() => note().thought ?? ''),
            }),
            Show({
              when: () => !!note().chapterTitle,
              children: () =>
                Div()
                  .class('wr-notes-chapter')
                  .text(() => note().chapterTitle ?? ''),
            }),
          ),
        View('r-icon')
          .class('wr-notes-del')
          .attr('name', 'close')
          .attr('title', t('delete_note'))
          .cssVar('--ran-icon-font-size', DEL_ICON_FONT_SIZE)
          .on('click', () => remove(note().id)),
      );

  return Div()
    .class('wr-notes')
    .children(
      Div().class('wr-notes-title').text(t('my_notes')),
      Show({
        when: () => notes().length > 0,
        children: () =>
          Div()
            .class('wr-notes-list')
            .children(
              Index({
                each: () => notes(),
                render: (n) => buildItem(n),
              }),
            ),
        fallback: () => buildEmpty(),
      }),
    );
};
