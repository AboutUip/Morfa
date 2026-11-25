# apps/web

Morfa 的 React 前端：在线设计编辑器、Agent 对话面板与设置界面。

> 状态：M1 工作区骨架已实现，可通过 `npm run dev` 启动。

## 已实现

- **启动加载**：固定 3 秒占位，进度由可组合的 bootstrap 任务驱动；后续替换为网络初始化任务即可展示真实进度。
- **工作区骨架**：顶栏 `logo | Morfa`、页面 / 图层侧栏、画布与属性面板，布局参考 Figma。
- **主题**：`system / light / dark`，首屏内联初始化，无闪烁；顶栏支持浅色 / 深色切换。
- **国际化**：`zh-CN` 默认、`en-US` 辅助，运行时切换并持久化。
- **资源策略**：使用系统字体栈，不依赖外部字体；标志按主题选择并按需请求。

## 技术栈

- React 19 + TypeScript
- Vite 8 + `@vitejs/plugin-react`
- i18next + react-i18next
- CSS Modules + CSS Variables
- XAIOP Vite 插件（按需编译 vendor SDK）

## 目录

```text
src/
├─ app/         入口组件与启动状态切换
├─ components/  BrandMark、图标等展示组件
├─ features/
│  ├─ bootstrap/  启动任务、进度 hook 与加载界面
│  └─ workspace/  顶栏、侧栏、画布与属性面板
├─ lib/         theme Provider、i18n 初始化
├─ locales/     zh-CN / en-US 文案资源
├─ styles/      设计令牌、主题与全局样式
└─ assets/      标志等参与构建的资源
public/         favicon、apple-touch-icon、PWA 图标与 manifest
```

## 命令

在仓库根目录执行：

```bash
npm run dev        # Vite 开发服务器 http://127.0.0.1:5173
npm run build      # tsc --noEmit + vite build
npm run preview    # 预览生产构建
npm run typecheck  # 仅类型检查
```

## 启动流程与扩展

- `src/features/bootstrap/bootstrap.ts`：任务类型、加权进度汇总与当前 3 秒占位任务。
- `src/features/bootstrap/useBootstrap.ts`：React 生命周期、取消与重试。
- `src/features/bootstrap/LoadingScreen.tsx`：进度条、任务文案、错误与重试界面。

接入真实初始化时，将 `workspaceBootstrapTasks` 替换为会话、项目、设计文档等异步任务，并在任务内部调用 `report(0..1)`。加载界面与状态机无需改动。

## 品牌资产

- 界面标志从 `src/assets/branding/` 导入；深色主题用透明标志，浅色主题用深色徽标。
- favicon 与 PWA 图标已复制到 `public/`。
- 使用规则见 [品牌规范](../../docs/design/branding.md)。

## 约定

- 所有颜色来自设计令牌，不在组件中硬编码；见 [主题规范](../../docs/design/theming.md)。
- 所有用户文案走 i18n，必须同时提供中英文；见 [i18n 规范](../../docs/design/i18n.md)。
- 设计文档与 API 类型从 `@morfa/shared` 导入。
- 功能模块通过公开入口互相引用，禁止深层跨模块导入。

## 后续工作

1. 增加路由与错误边界，拆分项目列表与编辑器页面。
2. 接入后端 API 与项目 / 设计文档状态。
3. 将固定占位任务替换为真实网络初始化任务。
4. 搭建编辑器画布与 Agent 面板。
5. 补充 Vitest / Playwright 测试。
