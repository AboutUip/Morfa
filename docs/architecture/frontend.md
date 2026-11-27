# 前端架构

> 状态：M1 账号、VCode、个人面板、实时通道与可复用加载界面已实现 · 最后更新：2026-11-26
>
> English: [frontend_en.md](frontend_en.md)

## 技术选型

| 项 | 选择 | 状态 |
| --- | --- | --- |
| 框架 | React 19 + TypeScript | 已接入 |
| 构建 | Vite 8 | 已接入 |
| 路由 | React Router | 建议 |
| 服务端状态 | TanStack Query | 建议 |
| 客户端状态 | Zustand（编辑器状态单独设计） | 建议 |
| 样式 | CSS Modules + CSS Variables（设计令牌） | 已采用 |
| 测试 | Vitest + Testing Library；Playwright 负责 E2E | 建议 |
| i18n | i18next + react-i18next | 已接入，详见 [i18n 规范](../design/i18n.md) |
| 开屏动画 | SplashScreen + 本地金属打击音效 + 淡出 | 已实现 |
| Agent 流式协议 | XAIOP browser SDK | 已内置，业务接入待开始，详见 [XAIOP 集成](../integrations/xaiop.md) |

依赖在 M1 搭建时锁定版本，并写入 `apps/web/package.json`；XAIOP 例外地通过根 workspace 注册为 `@bylan280/xaiop`，当前尚未在应用包中声明，业务代码首次 `import` 前需补上版本声明。

## 目录约定

```text
apps/web/
├─ public/                 # 静态资源（favicon、manifest）
├─ src/
│  ├─ app/                 # 入口、路由、全局 Provider、错误边界
│  ├─ components/          # 跨功能复用的展示型组件
│  ├─ features/            # 按业务域组织的功能模块
│  ├─ lib/                 # 通用工具、hooks、API 客户端、WebSocket 实时客户端
│  ├─ locales/             # zh-CN / en-US 文案资源
│  ├─ styles/              # 设计令牌、主题、全局样式
│  └─ assets/              # 参与构建的图片、字体
└─ README.md
```

### 功能模块

```text
features/
├─ auth/                   # AuthProvider、登录 / 注册与 VCode 设置门（已实现）
├─ profile/                # 个人面板、资料编辑、模型供应商、模型测试、API Key / MCP、导出与注销（已实现）
├─ projects/               # 项目主页与顶栏（已实现）
├─ editor/                 # 画布、图层、属性面板、快捷键（规划）
├─ agent/                  # 对话、运行状态、变更预览（规划）
└─ settings/               # 主题、语言、账户设置（规划）
```

当前 `App` 同时渲染 `projects/ProjectsPage` 与开屏层 `SplashScreen`；账号状态由 `auth/AuthProvider` 在应用启动时通过 `/api/auth/me` 恢复。跨功能复用的 `components/VCodeModal` 提供 3×4 数字键盘、6 位自动确认、物理键盘输入、焦点陷阱与焦点恢复；`components/PasswordModal` 提供当前密码验证、串行操作与同样的焦点管理；`components/ModelTestModal` 与 `components/ModelEditModal` 分别承载模型真实调用测试与能力配置，沿用相同的进入 / 退出动画和焦点管理。个人面板通过 `features/profile` 组织资料、导出与注销流程；`features/profile/ApiTab.tsx` 负责 MCP API Key、权限开关、llms.txt 链接与能力目录。

实时通道由 `lib/realtime/client.ts` 单例管理，每个 Tab 一条 WebSocket，负责请求 / 响应、订阅、心跳与指数退避重连。`AuthProvider` 登录后获取一次偏好快照，并订阅 `preferences.changed`；MCP、HTTP PATCH 或其他 Tab 修改偏好后，服务端直接推送到在线页面，不再使用 focus 节流或定时轮询。顶栏切换主题或语言时优先通过 WebSocket 提交，连接不可用时回退到一次性 HTTP。详见 [实时网络通道](realtime.md)。

Agent 流式载荷（规划）由 XAIOP browser SDK 解析。XAIOP 是结构化数据的编码 / 检查点层，后续复用单 WebSocket 实时通道而不是另建 SSE；事件映射与端点尚未实现，详见 [XAIOP 集成](../integrations/xaiop.md)。

规则：

- `features/*` 只能通过公开入口互相引用，禁止深层跨模块导入。
- `components/` 不依赖具体业务，可被任意 feature 使用。
- `lib/` 不依赖 React 组件；纯函数优先，便于测试。
- 设计文档 schema 与 API 类型从 `@morfa/shared` 导入，避免重复定义。

## 启动与加载

入口为 `src/main.tsx`，在渲染前初始化 i18n 与主题 Provider。`App` 会同时渲染 `ProjectsPage` 与开屏层：

- `components/SplashScreen.tsx`：进入页面后让 Logo 快速在屏幕中心出现；
- 播放 `public/audio/splash-metal.mp3` 的金属音效；
- 声音开始时 Logo 向左移动，右侧 `|` 与 `Morfa` 字标通过遮罩 / 位移展开；
- 完成后只让开屏层淡出，主页面始终在其背后保持已挂载状态，不发生页面切换。

`LoadingScreen`、`LoadingOverlay` 与 `lib/loading/` 仍然保留，作为其他异步流程的可复用加载界面与进度订阅源；它们不再参与启动流程。

## 状态管理

将状态分为三层，避免所有状态塞进同一个 store：

1. **服务端状态**：项目、设计文档、运行记录，由 TanStack Query 管理缓存、失效与重试。
2. **编辑器会话状态**：选区、缩放、面板开关、拖拽中状态，使用 Zustand 或在编辑器内部维护。
3. **持久化偏好**：主题、语言，写入 `localStorage` 并同步到 `<html>` 属性。

设计文档本身遵循命令 / 补丁模型，撤销栈与文档状态分离，便于 Agent 变更与人工操作共用同一套提交路径。

## 路由（规划）

| 路径 | 页面 |
| --- | --- |
| `/` | 首页 / 项目入口 |
| `/projects` | 项目列表 |
| `/projects/:projectId` | 设计编辑器 |
| `/settings` | 个人设置（主题、语言、账户） |
| `/share/:token` | 只读分享预览（后续） |

路由层负责加载对应 feature、设置 `<html lang>` 与页面标题；是否使用语言前缀路径见 [i18n 规范](../design/i18n.md) 的开放问题。

## 样式与主题

- 所有颜色、间距、圆角、字体、阴影来自设计令牌，组件不写魔法值。
- 主题通过 CSS Variables 切换，使用 `data-theme` 与 `color-scheme`，详见 [主题规范](../design/theming.md)。
- 布局优先使用 Flex / Grid；响应式断点由令牌统一维护。
- 画布内容主题与应用界面主题相互独立，避免深色模式下误改用户设计。

## 国际化

- 所有面向用户的文案通过 `t()` 获取，禁止在 JSX 中硬编码中文或英文。
- 日期、数字、货币使用 `Intl` 格式化，不手动拼接。
- 语言切换即时生效，并更新 `<html lang>`、文档标题与 `localStorage`。
- 详见 [i18n 规范](../design/i18n.md)。

## 移动端与桌面端

- **布局**：项目页占满视口宽度，桌面与移动端共用同一套 React 组件；仅通过 CSS 断点调整间距、字号与弹窗形态。
- **视口**：`index.html` 使用 `viewport-fit=cover`，样式通过 `env(safe-area-inset-*)` 适配刘海与底部手势区；根容器使用 `100dvh`，避免移动浏览器地址栏导致的高度跳动。
- **登录 / 注册**：桌面端为居中弹窗；`max-width: 640px` 时变为底部抽屉（bottom sheet），增加拖拽提示条并保留安全区底部间距。
- **触控**：移动端主要按钮高度不小于 44px，图标按钮扩大命中区域；表单输入使用 `font-size: 16px`，避免 iOS 聚焦时自动缩放。
- **滚动**：页面与弹窗分别使用 `overscroll-behavior` 与 `-webkit-overflow-scrolling: touch`，防止滚动穿透。
- **PWA 基础**：`site.webmanifest` 声明 standalone、启动路径、任意方向和 192/512 图标；后续再决定是否引入 Service Worker 与离线缓存。
- **断点**：`640px`（弹窗底部抽屉、顶栏触控优化）、`700px`（项目页间距与标题）、`380px`（极窄屏顶栏压缩）。

## 可访问性

- 交互元素优先使用原生语义标签，自定义控件补齐 `role`、键盘与焦点管理。
- 焦点样式不得移除，仅在可见性上做增强。
- 颜色对比度以 WCAG AA 为最低要求，主题评审需覆盖两套主题。
- 动画尊重 `prefers-reduced-motion`。

## 性能

- 路由级与面板级代码分割；编辑器核心与 Agent 面板分开加载。
- 画布避免不必要的全量重渲染，选择器订阅最小状态切片。
- 图片使用适当尺寸与现代格式，静态资源走缓存策略。
- 设定性能预算（首屏、交互延迟、帧率）并在 CI 中跟踪。

## 测试策略

| 层级 | 工具 | 覆盖重点 |
| --- | --- | --- |
| 单元 | Vitest | 工具函数、schema 校验、状态迁移 |
| 组件 | Testing Library | 表单、主题 / 语言切换、可访问性 |
| E2E | Playwright | 登录、创建项目、编辑保存、Agent 核心流程 |

## 待确认问题

- 画布渲染方案与编辑器状态模型。
- 是否采用 Tailwind 或其他原子化样式方案（当前倾向 CSS Modules + 令牌）。
- 路由级 i18n 是否需要 URL 前缀（影响分享链接与 SEO）。
- 编辑器撤销栈与 Agent 补丁的统一合并策略。
