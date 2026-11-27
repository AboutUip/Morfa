# MCP 集成

> 状态：已实现 · 最后更新：2026-11-27
>
> English: [mcp_en.md](mcp_en.md)

Morfa 原生提供 Model Context Protocol（MCP）服务端，把账号、项目画布、行为图、控件、预览和模型供应商能力安全地开放给 MCP 客户端或内部模块。完整参数以 `GET /llms.txt` 为准。

## 端点与传输

| 项 | 值 |
| --- | --- |
| MCP JSON-RPC | `POST /mcp` |
| 传输 | HTTP + JSON-RPC 2.0；单次请求返回 JSON，不使用长连接 |
| 协议版本 | `2024-11-05` / `2025-03-26` / `2025-06-18` |
| 认证 | `Authorization: Bearer mf_...` 或 `x-api-key: mf_...` |
| 文档 | `GET /llms.txt` |

当前实现是无状态 MCP 服务端：每次请求独立鉴权，不依赖 `Mcp-Session-Id`。支持 `initialize`、`ping`、`tools/list`、`tools/call`、`resources/list` 与 `prompts/list`，并为通知请求返回 `202`。

## 总控与能力接入

MCP 能力统一由 `apps/server/src/mcp/McpController` 管理：

```text
apps/server/src/mcp/
├─ controller.ts       # 能力注册、搜索、详情、权限校验、调用
├─ runtime.ts          # 进程内共享的 MCP 总控实例
├─ types.ts            # 能力定义、输入 schema、上下文与 DTO
├─ schema.ts           # 轻量参数校验
├─ auth.ts             # API Key 鉴权与请求 origin
├─ docs.ts             # llms.txt 生成
└─ capabilities/
   ├─ meta.ts          # 状态、搜索、详情
   ├─ appearance.ts    # 语言、主题
   ├─ profile.ts       # 昵称、头像
   ├─ security.ts      # 改密、注销
   ├─ data.ts          # 导出
   ├─ models.ts        # 模型供应商及子能力
   ├─ projects.ts      # 项目
   ├─ canvas.ts        # 页面、组件、关联线
   ├─ canvasNavigation.ts
   ├─ layout.ts        # 布局
   ├─ behavior.ts      # 项目共享行为图与控件行为图
   ├─ controls.ts      # 控件与实例
   ├─ accountComponents.ts
   ├─ runtime.ts       # 预览编译
   ├─ screenshots.ts
   ├─ assets.ts
   ├─ lint.ts
   └─ batch.ts         # 批量画布写操作
```

新模块接入只需从 `runtime.ts` 导入共享总控并注册一个能力：

```ts
import { mcpController } from "../mcp/runtime.js";

mcpController.register({
  name: "example_capability",
  title: { "zh-CN": "示例能力", "en-US": "Example capability" },
  description: { "zh-CN": "……", "en-US": "…" },
  usage: { "zh-CN": "……", "en-US": "…" },
  returns: { "zh-CN": "……", "en-US": "…" },
  category: "system",
  requirements: { vcode: false, password: false },
  annotations: READ_ONLY_ANNOTATIONS,
  inputSchema: {
    type: "object",
    properties: {},
    additionalProperties: false,
  },
  examples: [{ arguments: {} }],
  async execute(context, args) {
    return { ok: true };
  },
});
```

控制器统一处理参数校验、API Key 权限、MCP `tools/list` 过滤、`tools/call` 结果封装、REST 调用与 `llms.txt` 生成。

## API Key 与权限

API Key 在个人面板的「API」Tab 中创建，明文只在创建成功时显示一次，数据库仅保存 SHA-256 哈希与展示前缀。

每个 Key 有两个独立开关：

| 开关 | 作用 | 调用时要求 |
| --- | --- | --- |
| VCode 敏感能力 | 允许导出、注销、查看供应商 Key 等能力 | 每次调用必须传入 `vcode` |
| 密码敏感能力 | 允许修改密码、注销等能力 | 每次调用必须传入当前账号 `password` |

同时需要 VCode 与密码的能力（如 `cancel_account`）要求两个开关全部开启，并同时传入 `vcode` 与 `password`。服务端在每次调用时重新校验，不缓存验证结果。

`tools/list` 只返回当前 Key 可调用的能力。`search_mcp_capabilities` 与 `get_mcp_capability` 可以查询被权限锁定的能力及其要求，便于客户端解释为什么某个能力不可用。

## 能力清单

### 系统

| 能力 | 说明 | 额外验证 |
| --- | --- | --- |
| `get_mcp_status` | 当前账号、Key、权限、端点与可用能力统计 | 无 |
| `search_mcp_capabilities` | 按关键词 / 分类搜索能力 | 无 |
| `get_mcp_capability` | 获取某个能力的详细用法与参数 schema | 无 |

### 外观与资料

| 能力 | 说明 | 额外验证 |
| --- | --- | --- |
| `set_language` | 修改账号界面语言（`zh-CN` / `en-US`） | 无 |
| `set_theme` | 修改账号主题（`system` / `light` / `dark`） | 无 |
| `update_nickname` | 修改昵称 | 无 |
| `update_avatar` | 使用 Base64 或 data URI 修改头像 | 无 |

### 安全与数据

| 能力 | 说明 | 额外验证 |
| --- | --- | --- |
| `change_password` | 修改密码，并吊销其他网页会话 | 密码 |
| `cancel_account` | 注销账号，吊销全部会话与 API Key | 密码 + VCode |
| `get_export_status` | 查询有效导出包 | 无 |
| `create_export` | 创建加密导出包 | VCode |

`create_export` 返回的 `downloadUrl` 指向 `/api/mcp/export/latest`，使用同一个 API Key 以 Bearer 方式下载。

### 模型供应商

| 能力 | 说明 | 额外验证 |
| --- | --- | --- |
| `list_model_providers` | 列出供应商、模型与能力 | 无 |
| `add_model_provider` | 添加 OpenAI / Anthropic 供应商并拉取模型 | 无 |
| `refresh_model_provider` | 重新拉取模型列表 | 无 |
| `update_model_capabilities` | 设置流式 / 思考 / 多模态能力 | 无 |
| `test_model` | 真实调用模型验证可用性 | 无 |
| `reveal_model_provider_key` | 查看供应商明文 API Key | VCode |
| `delete_model_provider` | 删除供应商 | 无 |

### 项目与画布

| 能力 | 说明 |
| --- | --- |
| `list_projects` / `get_project` / `get_project_context` / `create_project` / `update_project` / `delete_project` | 项目列表、读取、创建、改名和删除 |
| `get_canvas` | 完整画布，包含页面、关联线和项目共享行为图 |
| `get_page` / `create_page` / `update_page` / `delete_page` / `duplicate_page` | 页面增删改 |
| `update_page_styles` / `update_page_widget` / `update_page_data` | 样式、组件和节点数据 |
| `create_link` / `update_link` / `delete_link` / `list_links` | 页面关联线 |
| `get_node_context` / `move_page` / `resize_page` / `set_page_parent` / `reorder_layers` | 图层位置、尺寸、父子和顺序 |
| `resolve_layout` / `set_layout` / `batch_update_layout` | 布局求解与写入 |
| `upload_asset` / `list_assets` / `delete_asset` | 项目资源 |

### 行为

项目里普通页面共用 `CanvasDocument.behavior`。控件定义页仍保存自己的行为图。事件块用 `nodeId`，判断和修改用 `targetId`；空着不会作用到被点击的节点。旧的 `triggers` 仍可读取，不再作为新建行为的写法。`setVariable` / `incrementVariable` / `toggleVariable` 只保留给旧数据迁移。

| 能力 | 说明 |
| --- | --- |
| `get_behavior` | 不传 `pageId` 读项目共享图；传页面 id 读该页自己的图 |
| `update_behavior` | 不传 `pageId` 或传 `__project__` 写共享图；传页面 id 只改该页 |
| `validate_behavior` | 校验共享图和页面图，也可先校验未保存草稿 |
| `list_supported_events` / `list_actions` / `list_conditions` | 当前事件、动作和判断词表 |
| `get_lint` / `validate_project` | 布局、关联线和行为图检查 |

### 控件、预览与截图

| 能力 | 说明 |
| --- | --- |
| `list_controls` / `get_control` / `create_control` / `update_control` / `delete_control` / `duplicate_control` | 控件定义 |
| `add_control_state` / `update_control_state` / `delete_control_state` | 控件状态 |
| `compile_control` / `list_compiled_components` / `create_control_instance` / `set_control_instance_state` | 编译、实例和切换状态 |
| `list_account_components` / `publish_account_component` / `import_account_component` / `delete_account_component` | 账号组件库 |
| `get_runtime_screens` / `compile_preview` / `get_preview_status` / `capture_simulator` | 运行预览 |
| `capture_page` / `capture_canvas` / `capture_node` / `list_screenshot_audits` | 截图 |
| `batch_apply` | 按顺序执行最多 200 个画布、布局或行为写操作 |

## 发现与调用 API

除 MCP 协议外，同一套能力通过 REST 暴露，便于其他模块或非 MCP 客户端接入：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/mcp/capabilities` | 列出当前 Key 可用能力；`?availableOnly=false` 返回全部能力 |
| `GET` | `/api/mcp/capabilities/:name` | 获取能力详情 |
| `POST` | `/api/mcp/capabilities/:name/call` | 直接调用能力，请求体即能力参数 |
| `GET` | `/api/mcp/export/latest` | 下载当前有效导出包 |

以上接口均使用 API Key Bearer 认证，权限规则与 MCP `tools/call` 完全一致。

Morfa Web 客户端的 MCP 能力目录优先通过实时通道的 `mcp.capabilities.list` / `mcp.capabilities.get` 读取，连接不可用时回退到上述 HTTP 接口；外部 MCP 客户端仍然只使用 `/mcp` 和公开 HTTP API。

## llms.txt

`GET /llms.txt` 是公开的 Markdown 文档，包含端点、认证、权限说明、MCP 调用示例以及全部能力的输入 schema 和参数示例。个人面板的「API」Tab 同时提供外链与下载按钮，方便直接提供给 LLM。

## 偏好同步

语言与主题同时保存在 `user_preferences` 表。前端登录后读取一次快照，并订阅实时通道的 `preferences.changed` 事件；MCP 修改语言 / 主题后，服务端立即推送给该用户所有在线页面，不再依赖 focus 或轮询。详见 [实时网络通道](../architecture/realtime.md)。

## 安全约定

- API Key 明文不落库、不写日志；服务端只保存 SHA-256 哈希。
- `tools/list` 不暴露被当前 Key 锁定的能力；发现类工具可以说明权限要求，但不包含任何凭据。
- VCode 与密码只在当次工具调用中校验；VCode 失败沿用账号级限流。
- 注销账号会删除全部 API Key 与网页会话。
- 部署时应通过 `APP_ORIGIN` 固定外部访问源，并在反向代理层把 `/mcp`、`/llms.txt`、`/api`、`/uploads` 路由到 API 服务。
- 模型供应商的 Base URL 由用户配置，服务端会发起请求；生产部署仍需评估出站网络的 SSRF 风险。
