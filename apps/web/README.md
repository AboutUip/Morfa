# apps/web

Morfa 的 React 前端：在线设计编辑器、Agent 对话面板与设置界面。

> 状态：目录已预留，应用尚未搭建（M0）。

## 计划技术栈

- React + TypeScript
- Vite（构建）
- React Router（路由）
- TanStack Query（服务端状态）
- i18next + react-i18next（i18n）
- CSS Modules + CSS Variables（样式与主题）
- Vitest + Testing Library / Playwright（测试）

## 目录

```text
src/
├─ app/         入口、路由、Provider、错误边界
├─ components/  跨功能复用的展示组件
├─ features/    业务功能（editor、agent、projects、settings、auth）
├─ lib/         API 客户端、hooks、工具函数
├─ locales/     zh-CN / en-US 文案资源
├─ styles/      设计令牌、主题与全局样式
└─ assets/      参与构建的静态资源
public/         favicon、manifest 等原样复制资源
```

## 约定

- 所有颜色来自设计令牌，不在组件中硬编码；见 [主题规范](../../docs/design/theming.md)。
- 所有用户文案走 i18n，必须同时提供中英文；见 [i18n 规范](../../docs/design/i18n.md)。
- 设计文档与 API 类型从 `@morfa/shared` 导入。
- 功能模块通过公开入口互相引用，禁止深层跨模块导入。

## 后续工作

1. 初始化 Vite + React + TypeScript，配置路径别名与严格模式。
2. 建立路由、全局 Provider 与错误边界。
3. 落地主题 Provider、令牌与无闪烁初始化。
4. 接入 i18n 与语言切换。
5. 搭建编辑器与 Agent 面板的占位布局。
