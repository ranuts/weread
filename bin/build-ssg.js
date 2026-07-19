// 预渲染为静态 HTML（SSG）。
// 流程：build:server（已在 build.sh 跑）→ 本脚本 build:client 一次 → 拷贝产物 →
// 注入 SW 缓存清单 → 对每条路由 render(url) 注入 <!--ssr-outlet-->。
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import childProcess from 'node:child_process';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const toAbsolute = (p) => path.resolve(__dirname, p);

const { render } = await import('../dist/server/server.js');

// 从 pages/ 目录推断待预渲染路由（home → 根，其余 → 同名子路径）。
const routesToPrerender = fs.readdirSync(toAbsolute('../pages')).map((file) => {
  const name = file.replace(/\.tsx?$/, '').toLowerCase();
  return { name: name === 'home' ? 'index' : name, url: name === 'home' ? '/weread/' : `/weread/${name}` };
});

// 1) 客户端只构建一次（所有路由共享同一份客户端 bundle + 模板）。
childProcess.execSync('npm run build:client', { stdio: 'inherit' });

// 2) 把 dist/client/assets/* 合并到共享的 dist/assets/。
const distAssets = toAbsolute('../dist/assets');
fs.mkdirSync(distAssets, { recursive: true });
const clientAssets = toAbsolute('../dist/client/assets');
if (fs.existsSync(clientAssets)) {
  for (const file of fs.readdirSync(clientAssets)) {
    const src = path.join(clientAssets, file);
    const dst = path.join(distAssets, file);
    if (fs.statSync(src).isDirectory()) {
      fs.mkdirSync(dst, { recursive: true });
      for (const sub of fs.readdirSync(src)) fs.copyFileSync(path.join(src, sub), path.join(dst, sub));
    } else {
      fs.copyFileSync(src, dst);
    }
  }
}

// 3) 把 dist/client/ 顶层其余文件（public 拷来的 sw.js/manifest/图标/models 等）上移到 dist/。
for (const file of fs.readdirSync(toAbsolute('../dist/client'))) {
  fs.cpSync(toAbsolute(`../dist/client/${file}`), toAbsolute(`../dist/${file}`), { recursive: true });
}

// 4) 把资源清单注入 sw.js 头部（precache 列表），只做一次。
const swPath = toAbsolute('../dist/sw.js');
if (fs.existsSync(swPath)) {
  const assetsString = fs
    .readdirSync(distAssets)
    .map((asset) => `"/weread/assets/${asset}"`)
    .join(',');
  const swContent = fs.readFileSync(swPath, 'utf-8');
  fs.writeFileSync(swPath, `const SERVICE_WORK_CACHE_FILE_PATHS = [${assetsString}];` + swContent);
}

// 5) 逐路由注入 SSR 外壳。共享模板来自 dist/client/views/index.html。
const template = fs.readFileSync(toAbsolute('../dist/client/views/index.html'), 'utf-8');
for (const { name, url: routeUrl } of routesToPrerender) {
  const appHtml = await render(routeUrl);
  const html = template.replace('<!--ssr-outlet-->', appHtml);
  const filePath = name === 'index' ? toAbsolute('../dist/index.html') : toAbsolute(`../dist/${name}/index.html`);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, html);
}
