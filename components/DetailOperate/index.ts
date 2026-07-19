import 'ranui/icon';
import { Div, View } from 'ranui/builder';
import { renderPopover } from '@/components/Popover';
import { renderBookDetailMenu } from '@/components/DetailMenu';
import type { ElementBuilder } from 'ranui/builder';

const MENU_ICON_FONT_SIZE = '24px';

/** 菜单触发器（圆形按钮 + menu 图标）。 */
const menuTrigger = (): ElementBuilder =>
  Div()
    .class('wr-operate-trigger')
    .children(View('r-icon').class('hover-icon').attr('name', 'menu').cssVar('--ran-icon-font-size', MENU_ICON_FONT_SIZE));

/** 桌面端：右上角浮动菜单按钮，点击左向弹出书内菜单。 */
export const renderBookDetailOperate = (): ElementBuilder =>
  Div()
    .class('wr-operate')
    .children(
      renderPopover({ placement: 'left', trigger: 'click', overlay: renderBookDetailMenu(), children: menuTrigger() }),
    );

/** 移动端：底部 chrome 栏内的菜单按钮，点击向上弹出书内菜单。 */
export const renderMobileBookDetailOperate = (): ElementBuilder =>
  Div()
    .class('wr-operate-mobile')
    .children(
      renderPopover({ placement: 'top', trigger: 'click', overlay: renderBookDetailMenu(), children: menuTrigger() }),
    );
