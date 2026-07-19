import 'ranui/section';
import { Div, View } from 'ranui/builder';
import type { ElementBuilder } from 'ranui/builder';

export interface PageOptions {
  /** 服务端渲染时只出外壳（不碰 window/DB），数据在 client 从 IndexedDB 加载 */
  ssr?: boolean;
}

// Phase 1 占位骨架；Phase 3 重做为完整书架（r-card 栅格 + 搜索 + 主题切换）。
export const renderHome = (_opts: PageOptions = {}): ElementBuilder =>
  View('r-section')
    .class('wr-home')
    .attr('heading', 'weread')
    .attr('subtitle', 'home — skeleton')
    .children(Div().class('flex-center').text('home placeholder (ranui builder)'));
