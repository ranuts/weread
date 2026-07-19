import 'ranui/section';
import { Div, View } from 'ranui/builder';
import type { ElementBuilder } from 'ranui/builder';
import type { PageOptions } from '@/pages/home';

// Phase 1 占位骨架；Phase 4 重做为阅读页（翻页信号 + AI 增强 + View Transition）。
export const renderBookDetail = (_opts: PageOptions = {}): ElementBuilder =>
  View('r-section')
    .class('wr-book-detail')
    .attr('heading', 'book-detail')
    .attr('subtitle', 'reader — skeleton')
    .children(Div().class('flex-center').text('book-detail placeholder (ranui builder)'));
