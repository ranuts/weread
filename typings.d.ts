/// <reference types="vite/client" />
// 去 React 后不再需要 React.JSX 内联元素声明。
// pwa-install 通过 document.createElement + setAttribute 命令式创建，无需 JSX 类型。
// vite/client 提供 *.css / *.scss 副作用导入与 *?url 资源导入的模块声明。
export {};
