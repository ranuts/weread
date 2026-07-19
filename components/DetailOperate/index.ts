import 'ranui/icon';
import { Div, Span, View } from 'ranui/builder';
import { renderPopover } from '@/components/Popover';
import { renderBookDetailMenu } from '@/components/DetailMenu';
import { renderReadingSettings } from '@/components/ReadingSettings';
import { renderNotesPanel } from '@/components/NotesPanel';
import type { ElementBuilder } from 'ranui/builder';

const MENU_ICON_FONT_SIZE = '24px';
const NOTES_ICON_FONT_SIZE = '20px';

/** 菜单触发器（圆形按钮 + menu 图标）。 */
const menuTrigger = (): ElementBuilder =>
  Div()
    .class('wr-operate-trigger')
    .children(View('r-icon').class('hover-icon').attr('name', 'menu').cssVar('--ran-icon-font-size', MENU_ICON_FONT_SIZE));

/** 阅读设置触发器（圆形按钮 + 「Aa」字样，Kindle 式排版入口）。 */
const settingsTrigger = (): ElementBuilder =>
  Div()
    .class('wr-operate-trigger')
    .children(Span().class('wr-operate-aa').text('Aa'));

/** 笔记触发器（圆形按钮 + book 图标）。 */
const notesTrigger = (): ElementBuilder =>
  Div()
    .class('wr-operate-trigger')
    .children(View('r-icon').class('hover-icon').attr('name', 'book').cssVar('--ran-icon-font-size', NOTES_ICON_FONT_SIZE));

/** 桌面端：右上角浮动操作簇（排版设置 + 笔记 + 书内菜单），点击左向弹出对应浮层。 */
export const renderBookDetailOperate = (): ElementBuilder =>
  Div()
    .class('wr-operate')
    .children(
      renderPopover({ placement: 'left', trigger: 'click', overlay: renderReadingSettings(), children: settingsTrigger() }),
      renderPopover({ placement: 'left', trigger: 'click', overlay: renderNotesPanel(), children: notesTrigger() }),
      renderPopover({ placement: 'left', trigger: 'click', overlay: renderBookDetailMenu(), children: menuTrigger() }),
    );

/** 移动端：底部 chrome 栏内的操作簇（排版设置 + 笔记 + 书内菜单），点击向上弹出对应浮层。 */
export const renderMobileBookDetailOperate = (): ElementBuilder =>
  Div()
    .class('wr-operate-mobile')
    .children(
      renderPopover({ placement: 'top', trigger: 'click', overlay: renderReadingSettings(), children: settingsTrigger() }),
      renderPopover({ placement: 'top', trigger: 'click', overlay: renderNotesPanel(), children: notesTrigger() }),
      renderPopover({ placement: 'top', trigger: 'click', overlay: renderBookDetailMenu(), children: menuTrigger() }),
    );
