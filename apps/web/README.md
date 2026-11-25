# apps/web

Morfa 的 React 前端：在线设计编辑器、Agent 对话面板与设置界面。

> 状态：M1 项目页、认证、VCode、个人面板、模型供应商配置与测试、API Key / MCP 管理、WebSocket 实时通道已实现，可通过 `npm run dev` 启动。

## 已实现

- **启动加载**：`components/LoadingScreen` 负责展示，`components/LoadingOverlay` 订阅 `LoadingProgressController`；进度、任务文案与底部文案都支持实时订阅和更新。当前 bootstrap 仍使用 3 秒占位任务，后续替换为网络初始化任务即可复用同一套加载界面。
- **项目主页**：桌面上顶栏保留「项目 | 组件 | 设置」水平 Tab；移动端将其收纳到左上角 `logo | Morfa` 按钮，点击展开带图标与选中标记的页面菜单，箭头随展开旋转；项目区域默认空状态，右上角提供登录入口。
- **组件 / 设置**：当前为占位页，后续接入组件库与完整设置。
- **登录 / 注册弹窗**：支持登录与注册切换；点击蒙版不关闭，只通过右上角关闭按钮退出。
- **注册**：头像、昵称、登录账号、密码、确认密码与必选 6 位 VCode；可选导入已注销账号的数据包；注册成功后自动登录。
- **VCode**：独立可复用的 3×4 数字键盘弹窗，6 位自动确认；用于导出、注销、忘记密码与查看模型 API Key。已有用户缺少 VCode 时自动登出，登录后弹窗引导设置。
- **密码验证**：独立可复用的密码验证弹窗，与 VCode 一样禁止点击蒙版关闭，只保留 X 与 Esc；用于修改密码和注销账号。
- **登录态**：会话恢复、顶栏头像 / 昵称展示；点击头像打开个人面板。桌面端为居中双列布局（左侧「个人 / 账号 / 模型 / API」竖排 Tab，左下退出登录）；移动端为全屏布局，顶部横向 Tab、底部退出登录，内容区使用安全区与 `visualViewport` 适配。账号语言 / 主题偏好会同步到服务端，并订阅实时通道的 `preferences.changed` 立即应用 MCP 或其他页面的修改。
- **实时通道**：`lib/realtime/client.ts` 单例维护每 Tab 一条 WebSocket，统一信封区分模块与操作；支持请求 / 响应、订阅、自动重订阅、心跳、指数退避与 HTTP 回退。高频与推送类请求走实时通道，一次性、文件与公开 MCP 继续走 HTTP。个人页可改头像、昵称与密码；账号页展示账号信息、加密数据导出与注销账号；模型页可创建 OpenAI / Anthropic 供应商，保存时自动拉取模型，供应商卡片可折叠查看模型列表；每个模型提供「测试」与「编辑」：测试会真实调用模型并以流式展示思考过程和返回内容，编辑弹窗可配置流式、思考与多模态能力。API 页可创建 MCP API Key 并设置 VCode / 密码敏感权限，查看 MCP 端点、下载 `llms.txt`，并搜索 / 展开全部 MCP 能力。修改密码只需一个新密码输入框，点击「修改」后验证旧密码；注销按「密码验证 → VCode 验证」串行执行；查看模型 API Key 同样需要 VCode。
- **移动端 / 桌面端**：安全区适配、`100dvh`、移动端登录弹窗自动切换为底部抽屉、16px 输入防 iOS 缩放、移动端触控目标扩大。
- **键盘无障碍**：跳过链接、顶栏 Tab 方向键、语言菜单键盘导航、弹窗焦点陷阱 / Esc / 焦点恢复。
- **PWA 基础**：manifest、192/512 图标与 apple-touch-icon；暂未注册 Service Worker。
- **主题**：`system / light / dark`，首屏内联初始化，无闪烁；顶栏支持浅色 / 深色切换。
- **国际化**：`zh-CN` 默认、`en-US` 辅助；顶栏使用图标 + 当前语言的下拉菜单切换并持久化。
- **资源策略**：使用系统字体栈，不依赖外部字体；标志按主题选择并按需请求。

## 技术栈

- React 19 + TypeScript
- Vite 8 + `@vitejs/plugin-react`
- i18next + react-i18next
- CSS Modules + CSS Variables
- Maple Mono CN 等宽中英文字体（WOFF2 子集，OFL-1.1）
- XAIOP Vite 插件（按需编译 vendor SDK）

## 目录

```text
src/
├─ app/         入口组件与启动状态切换
├─ components/  BrandMark、图标等展示组件
├─ features/
│  ├─ bootstrap/  启动任务、进度 hook 与加载界面
│  ├─ auth/       AuthProvider 与登录 / 注册弹窗
│  ├─ profile/    个人面板、模型、API Key / MCP
│  └─ projects/   项目主页与顶栏
├─ lib/         theme Provider、i18n、API 客户端与 WebSocket 实时客户端
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
- `src/features/bootstrap/useBootstrap.ts`：连接 bootstrap 任务与加载进度源，处理取消与重试。
- `src/lib/loading/`：`LoadingProgressController`、`createLoadingProgressController` 与 `useLoadingProgress` 订阅 hook。
- `src/components/LoadingScreen.tsx`：纯展示加载界面，可独立传入进度、任务文案、底部文案与错误重试。
- `src/components/LoadingOverlay.tsx`：订阅任意进度源的可复用加载层。

接入真实初始化时，将 `workspaceBootstrapTasks` 替换为会话、项目、设计文档等异步任务，并在任务内部调用 `report(0..1)`。其他业务流程也可以创建独立的 `LoadingProgressController`，在异步任务中 `start / report / finish`，再挂载 `LoadingOverlay` 复用同一套加载体验。

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
