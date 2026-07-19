import { registerBuiltinIcons } from 'ranui/icons';
import { initTheme } from 'ranui/theme';
import { mountApp } from '@/app';
import '@/styles/base.css'; // 单一样式入口（内部 @import 'ranui/style' 等）

// 客户端引导：注册内置图标 → 恢复持久化主题（light/dark/system）→ 挂载页面。
// 各页面/组件按需 `import 'ranui/<component>'` 自注册对应自定义元素，保持包体精简。
registerBuiltinIcons();
initTheme();
mountApp();
