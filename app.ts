import { createRoot } from 'ranui/builder';
import { ROUTE_PATH, resolveRoute } from '@/router';
import { closeDB, initDB, resumeDB } from '@/store';
import { renderBookDetail } from '@/pages/book-detail';
import { renderHome } from '@/pages/home';
import { renderLoading } from '@/components/Loading';
import '@khmyznikov/pwa-install';
import '@/styles/view-transition.scss';

/** 命令式创建 pwa-install（原 React useEffect 里的逻辑，`/weread/` 字面量保持不变）。 */
const createPwaInstall = (): (() => void) => {
  const pwaInstall = document.createElement('pwa-install');
  pwaInstall.setAttribute('manifest-url', '/weread/manifest.json');
  pwaInstall.setAttribute('name', 'weread');
  pwaInstall.setAttribute('description', 'Progressive web application');
  pwaInstall.setAttribute('icon', '/weread/read.svg');
  document.body.appendChild(pwaInstall);
  return () => document.body.removeChild(pwaInstall);
};

/**
 * 客户端挂载：按 pathname 选页，在 `createRoot` 里构建并替换 #app 的 light DOM
 * （自定义元素 upgrade 时复用 server 侧 shadow root）。含 DB / PWA / 可见性生命周期。
 */
export const mountApp = (): void => {
  initDB();
  const removePwa = createPwaInstall();
  const onVis = (): void => {
    if (document.visibilityState === 'visible') resumeDB();
  };
  document.addEventListener('visibilitychange', onVis, false);

  const container = document.getElementById('app');
  if (!container) return;
  const route = resolveRoute(location.pathname);

  const dispose = createRoot((d) => {
    // 页面工厂必须在 createRoot 内调用，signal 绑定 / onCleanup 才有 owner
    const node =
      route === ROUTE_PATH.BOOK_DETAIL
        ? renderBookDetail()
        : route === ROUTE_PATH.LOADING
          ? renderLoading()
          : renderHome();
    container.replaceChildren(node.build());
    return d;
  });

  window.addEventListener(
    'pagehide',
    () => {
      dispose?.();
      closeDB();
      removePwa();
      document.removeEventListener('visibilitychange', onVis);
    },
    { once: true },
  );
};
