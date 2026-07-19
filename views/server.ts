import 'ranui'; // 注册所有 SSR 组件类（isSSR：typeof document === 'undefined'）
import { registerBuiltinIcons } from 'ranui/icons';
import { createRoot } from 'ranui/builder';
import { renderHTMLToString } from 'ranui/ssr-stream';
import { ROUTE_PATH, base, resolveRoute } from '@/router';
import { renderBookDetail } from '@/pages/book-detail';
import { renderHome } from '@/pages/home';
import { renderLoading } from '@/components/Loading';

registerBuiltinIcons();

/**
 * SSG 预渲染：按路由构建页面外壳 → builder `.serialize()` 出裸 `<r-*>` 标签 →
 * `renderHTMLToString` 实例化已注册的 SSR 组件、内联 `<template shadowrootmode>`（DSD）。
 */
export const render = async (path = '/'): Promise<string> => {
  const clean = (path.startsWith(base) ? path : `${base}${path.startsWith('/') ? '' : '/'}${path}`).split('?')[0];
  const route = resolveRoute(clean);

  let bare = '';
  const dispose = createRoot((d) => {
    const node =
      route === ROUTE_PATH.BOOK_DETAIL
        ? renderBookDetail({ ssr: true })
        : route === ROUTE_PATH.LOADING
          ? renderLoading()
          : renderHome({ ssr: true });
    bare = node.serialize();
    return d;
  });
  dispose();

  return renderHTMLToString(bare);
};
