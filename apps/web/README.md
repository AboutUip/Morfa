# apps/web

Morfa 的 React 前端：在线设计编辑器、Agent 对话面板与设置界面。

> 状态：M1 项目页与认证弹窗已实现，可通过 `npm run dev` 启动。

## 已实现

- **启动加载**：固定 3 秒占位，进度由可组合的 bootstrap 任务驱动；后续替换为网络初始化任务即可展示真实进度。
- **项目主页**：顶栏 `logo | Morfa`，项目区域默认空状态，右上角提供登录入口。
- **登录 / 注册弹窗**：支持登录与注册切换；点击蒙版不关闭，只通过右上角关闭按钮退出。
- **注册**：头像、昵称、登录账号、密码、确认密码；注册成功后自动登录。
- **登录态**：会话恢复、顶栏头像 / 昵称展示与退出登录。
- **移动端 / 桌面端**：安全区适配、`100dvh`、移动端登录弹窗自动切换为底部抽屉、16px 输入防 iOS 缩放、移动端触控目标扩大。
- **PWA 基础**：manifest、192/512 图标与 apple-touch-icon；暂未注册 Service Worker。
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
│  ├─ auth/       AuthProvider 与登录 / 注册弹窗
│  └─ projects/   项目主页与顶栏
├─ lib/         theme Provider、i18n 初始化
├─ locales/     zh-CN / en-US 文案资源
├─ styles/      设计令牌、主题与全局样式
└─ assets/      标志等参与构建的资源
public/         favicon、apple-touch-icon、PWA 图标与 manifest
```

## 命令

在仓库根目录执行：

```bash
npm run dev        # 根目录：同时启动 Web 与 API（5173 / 3001）
npm run build      # tsc --noEmit + vite build + 服务端类型检查
npm run preview    # 预览生产构建
npm run typecheck  # 类型检查
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

## 认证接口

前端通过 Vite proxy 调用 `/api` 与 `/uploads`（开发环境指向 `127.0.0.1:3001`）。`AuthProvider` 在应用启动时请求 `/api/auth/me` 恢复会话；登录与注册成功后更新用户状态，注册由服务端直接写入会话 Cookie。

## 后续工作

1. 增加路由与错误边界，拆分项目列表与编辑器页面。
2. 项目 / 设计文档状态与创建流程。
3. 将固定占位任务替换为真实网络初始化任务。
4. 搭建编辑器画布与 Agent 面板。
5. 补充 Vitest / Playwright 测试。
