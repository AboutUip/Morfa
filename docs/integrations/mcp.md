# MCP 集成

> 状态：已实现 · 最后更新：2026-11-26

Morfa 原生提供 Model Context Protocol（MCP）服务端，把账号、外观、数据导出与模型供应商能力安全地开放给 MCP 客户端或内部模块。

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
   └─ models.ts        # 模型供应商及子能力
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

## 发现与调用 API

除 MCP 协议外，同一套能力通过 REST 暴露，便于其他模块或非 MCP 客户端接入：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/mcp/capabilities` | 列出当前 Key 可用能力；`?availableOnly=false` 返回全部能力 |
| `GET` | `/api/mcp/capabilities/:name` | 获取能力详情 |
| `POST` | `/api/mcp/capabilities/:name/call` | 直接调用能力，请求体即能力参数 |
| `GET` | `/api/mcp/export/latest` | 下载当前有效导出包 |

以上接口均使用 API Key Bearer 认证，权限规则与 MCP `tools/call` 完全一致。

## llms.txt

`GET /llms.txt` 是公开的 Markdown 文档，包含端点、认证、权限说明、MCP 调用示例以及全部能力的输入 schema 和参数示例。个人面板的「API」Tab 同时提供外链与下载按钮，方便直接提供给 LLM。

## 偏好同步

语言与主题同时保存在 `user_preferences` 表。前端登录后读取服务端偏好并应用，之后在窗口重新获得焦点（15 秒节流）、页面重新可见或每 60 秒同步一次，因此通过 MCP 修改语言 / 主题后，已打开的 Morfa 页面也会在短时间内更新。

## 安全约定

- API Key 明文不落库、不写日志；服务端只保存 SHA-256 哈希。
- `tools/list` 不暴露被当前 Key 锁定的能力；发现类工具可以说明权限要求，但不包含任何凭据。
- VCode 与密码只在当次工具调用中校验；VCode 失败沿用账号级限流。
- 注销账号会删除全部 API Key 与网页会话。
- 部署时应通过 `APP_ORIGIN` 固定外部访问源，并在反向代理层把 `/mcp`、`/llms.txt`、`/api`、`/uploads` 路由到 API 服务。
- 模型供应商的 Base URL 由用户配置，服务端会发起请求；生产部署仍需评估出站网络的 SSRF 风险。
