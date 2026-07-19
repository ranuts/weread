import 'ranui/loading';
import { Div, View } from 'ranui/builder';
import type { ElementBuilder } from 'ranui/builder';

/**
 * 加载态：ranui `r-loading`（Geist 观感），居中铺满。
 * 返回 ElementBuilder：server 端 `.serialize()`，client 端 `.build()`。
 */
export const renderLoading = (): ElementBuilder =>
  Div()
    .class('flex-center wr-loading')
    .children(
      View('r-loading')
        .attr('name', 'circle-fold')
        .cssVar('--loading-circle-fold-item-before-background', 'var(--ran-color-primary)'),
    );
