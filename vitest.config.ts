import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

// vite.config.ts 的 alias 依赖 vite 的 root 相对路径解析（'/lib' 形式），
// node 环境下需要真实文件系统路径
const alias = ['components', 'router', 'lib', 'store', 'assets', 'types', 'styles', 'pages', 'locales'].reduce(
  (acc, dir) => {
    acc[`@/${dir}`] = resolve(import.meta.dirname, dir);
    return acc;
  },
  {} as Record<string, string>,
);

export default defineConfig({
  resolve: { alias },
  test: {
    include: ['**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', 'public/**'],
  },
});
