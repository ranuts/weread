// weread service worker。
//
// 缓存分两类，解决「代码更新了却一直吃旧缓存」：
//  1) 资源缓存 ASSET_CACHE：名字带构建注入的 BUILD_ID（见 bin/build-ssg.js）。每次构建 BUILD_ID
//     变 → sw.js 字节变 → 浏览器检测到新 SW；激活时删掉所有非当前版本的资源缓存，旧 JS/CSS/HTML
//     不再残留。HTML 导航走「网络优先」，保证新代码即时生效，离线时才回退缓存。
//  2) 模型缓存 MODEL_CACHE：固定名字，**跨版本保留**。语言模型权重上百 MB，不能随每次发版清掉
//     （否则每次更新都要重下 100MB）。走「缓存优先」，内容按 URL 恒定，天然可长期复用。
//
// BUILD_ID / SERVICE_WORK_CACHE_FILE_PATHS 由构建脚本 prepend 注入；dev 直接跑 public/sw.js
// 时二者未定义，用 typeof 守卫降级（BUILD_ID→'dev'，预缓存列表→空），不再像旧版那样在 install 崩。

const BUILD_TAG = typeof BUILD_ID !== 'undefined' ? BUILD_ID : 'dev';
const ASSET_CACHE = `weread_assets_${BUILD_TAG}`;
const MODEL_CACHE = 'weread_models';
const PRECACHE_URLS = typeof SERVICE_WORK_CACHE_FILE_PATHS !== 'undefined' ? SERVICE_WORK_CACHE_FILE_PATHS : [];

// 这些请求不缓存（上报 / 插件 / blob 等）
const IGNORE_REQUEST_LIST = ['google', 'chrome-extension', 'baidu.com', 'blob:', 'www.google-analytics.com'];

const isCacheableGet = (request) =>
  request.method === 'GET' && !IGNORE_REQUEST_LIST.some((item) => request.url.includes(item));

/** 模型权重请求 → 走持久 MODEL_CACHE */
const isModelRequest = (url) => url.includes('/models/');

/** HTML 页面导航 → 走网络优先（拿到最新代码） */
const isNavigation = (request) =>
  request.mode === 'navigate' || (request.headers.get('accept') || '').includes('text/html');

/** 缓存优先：命中即返回，未命中取网络并写入指定缓存（内容恒定的 hash 资源 / 模型权重用） */
const cacheFirst = async (request, cacheName) => {
  try {
    const cached = await caches.match(request.url);
    if (cached) return cached;
    const response = await fetch(request);
    if (isCacheableGet(request) && response.status === 200 && response.clone) {
      const cache = await caches.open(cacheName);
      cache.put(request.url, response.clone());
    }
    return response;
  } catch (error) {
    console.log('service worker cacheFirst error:', error, request?.url);
    return new Response('Network error happened', { status: 408, headers: { 'Content-Type': 'text/plain' } });
  }
};

/** 网络优先：优先取网络并回填缓存，离线时回退缓存（HTML 导航用，保证更新即时生效） */
const networkFirst = async (request) => {
  try {
    const response = await fetch(request);
    if (isCacheableGet(request) && response.status === 200 && response.clone) {
      const cache = await caches.open(ASSET_CACHE);
      cache.put(request.url, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await caches.match(request.url);
    if (cached) return cached;
    console.log('service worker networkFirst error:', error, request?.url);
    return new Response('Network error happened', { status: 408, headers: { 'Content-Type': 'text/plain' } });
  }
};

self.addEventListener('install', (event) => {
  // 新 SW 立即进入 waiting → activate，不等所有旧标签页关闭
  self.skipWaiting();
  event.waitUntil(
    caches.open(ASSET_CACHE).then((cache) =>
      // 逐个 put，单个失败不拖垮整体（Cache.addAll 会 all-or-nothing）
      Promise.all(
        PRECACHE_URLS.map((url) =>
          fetch(url)
            .then((response) => (response.ok ? cache.put(url, response) : undefined))
            .catch((error) => console.log('service worker precache error:', url, error)),
        ),
      ),
    ),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // 删除除「当前版本资源缓存」和「持久模型缓存」外的所有缓存（含旧版本 + 旧 ranuts_weread）
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key !== ASSET_CACHE && key !== MODEL_CACHE).map((key) => caches.delete(key)));
      // 立即接管已打开的页面，新策略当次生效
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  if (isModelRequest(request.url)) {
    event.respondWith(cacheFirst(request, MODEL_CACHE));
  } else if (isNavigation(request)) {
    event.respondWith(networkFirst(request));
  } else {
    // 其余同源资源（内容 hash 命名的 JS/CSS/字体/图标）内容恒定，缓存优先
    event.respondWith(cacheFirst(request, ASSET_CACHE));
  }
});
