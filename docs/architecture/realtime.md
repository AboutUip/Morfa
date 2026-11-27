# 实时网络通道

> 状态：基础层已实现 · 最后更新：2026-11-26
>
> English: [realtime_en.md](realtime_en.md)

Morfa 使用一条 WebSocket 连接承载高频请求、订阅与服务器推送。它不是一个“巨型请求”，而是**单连接上的多路复用协议**。

## 目标

- 高频、低延迟、小体积的操作只保留一条实时连接
- 订阅类数据由服务器主动推送，不再轮询
- HTTP 继续承载一次性请求、文件、敏感操作与公开 API
- 同一业务操作只实现一次，HTTP / WebSocket 共用 service
- 为后续画布协同、Agent 流式输出、通知和在线状态预留统一通道

## 传输边界

| 场景 | 传输 |
| --- | --- |
| 偏好同步、通知、在线状态、协同 | WebSocket |
| Agent / 模型流式事件 | WebSocket（后续） |
| 登录、注册、VCode | HTTP |
| 文件上传、下载、导出包 | HTTP |
| 公开 MCP JSON-RPC | HTTP |
| 密码、VCode、API Key 等敏感一次操作 | HTTP |

WebSocket 是内部 Web 客户端的实时通道，**不是公开 MCP 协议的一部分**。外部 MCP 客户端继续使用 `POST /mcp` 的标准 HTTP JSON-RPC。

Agent 流式事件（后续）复用本通道，结构化增量载荷规划使用 XAIOP 编码；XAIOP 只负责载荷，不改变本页定义的信封与操作模型。详见 [XAIOP 集成](../integrations/xaiop.md)。

## 端点

```text
GET /api/realtime
Upgrade: websocket
Cookie: morfa_session=...
Origin: <same-origin>
```

当前通过 HttpOnly Session Cookie 鉴权，并校验 `Origin`。连接关闭时服务端会释放订阅。

Vite 开发环境通过 `/api/realtime` 的 `ws: true` 代理转发到 API 服务。

## 信封

```json
{
  "v": 1,
  "id": "r_xxx",
  "type": "request",
  "module": "preferences",
  "action": "update",
  "payload": {
    "themeMode": "dark"
  },
  "meta": {
    "traceId": "trace_xxx",
    "ts": 1795639000000
  }
}
```

响应：

```json
{
  "v": 1,
  "id": "r_xxx",
  "type": "response",
  "ok": true,
  "payload": {
    "themeMode": "dark"
  }
}
```

错误：

```json
{
  "v": 1,
  "id": "r_xxx",
  "type": "response",
  "ok": false,
  "error": {
    "code": "PREFERENCE_THEME_INVALID",
    "message": "主题设置不正确"
  }
}
```

服务器推送：

```json
{
  "v": 1,
  "type": "event",
  "module": "preferences",
  "event": "changed",
  "payload": {
    "themeMode": "dark"
  },
  "seq": 12
}
```

订阅：

```json
{
  "v": 1,
  "type": "subscribe",
  "module": "preferences",
  "event": "changed"
}
```

字段约束：

- `v`：协议版本，目前固定为 `1`
- `id`：请求与响应关联，客户端生成
- `module` / `action`：路由到操作注册表
- `event`：服务器推送事件名
- `payload`：业务数据
- `seq`：事件序号，用于调试和后续断线补偿
- `meta`：只放 traceId、时间等非敏感信息

## 服务端分层

```text
src/realtime/
├─ events.ts          # 用户级领域事件总线
├─ registry.ts        # module.action -> handler
├─ gateway.ts         # 连接、订阅、心跳、路由、推送
├─ index.ts           # 单例网关
└─ operations/
   ├─ preferences.ts  # 偏好读写
   └─ index.ts        # 操作注册
```

业务层只发布领域事件：

```text
updateUserPreferences()
  -> 写入 SQLite
  -> publishRealtimeEvent({ module: "preferences", event: "changed" })
  -> gateway 找到订阅了该事件的用户连接
  -> 推送 event
```

新增实时模块时：

1. 在 `realtime/operations/` 注册 `register(module, action, handler)`
2. handler 调用已有 service，不重复业务逻辑
3. 需要推送时由 service 发布 `publishRealtimeEvent`
4. 客户端 `realtimeClient.request()` 或 `subscribe()`

## 客户端

`apps/web/src/lib/realtime/client.ts` 是全局单例：

- 每个 Tab 一条连接
- 自动拼接 `ws://` / `wss://`
- 请求 ID、pending map、超时与取消
- 订阅注册与重连后自动重订阅
- 指数退避 + 随机抖动
- 手动退出后不再重连
- 连接关闭后 reject 所有 pending 请求

`apps/web/src/lib/realtime/index.ts` 提供偏好与 MCP 能力目录封装，优先 WebSocket，连接不可用时回退到一次性 HTTP 请求。公开 MCP 能力调用仍以 HTTP JSON-RPC 对外提供，实时通道只服务 Web 客户端的内部请求。

## 当前接入

| 模块 | 操作 | 推送 |
| --- | --- | --- |
| `preferences` | `get` / `update` | `preferences.changed` |
| `mcp` | `capabilities.list` / `capabilities.get` | 暂无 |

偏好流程：

1. 登录后通过 HTTP 或 WebSocket 获取一次偏好快照
2. 订阅 `preferences.changed`
3. MCP、HTTP PATCH 或其他 Tab 修改偏好
4. 服务端通过 WebSocket 推送给该用户所有在线连接
5. 前端立即应用语言与主题

不再使用窗口 focus 节流或定时轮询。

## 安全与限制

- 单条 WebSocket 消息上限 256 KB
- 心跳间隔 25 秒，失活连接自动终止
- 服务端校验 Origin
- 退出登录、修改密码、重置密码、注销账号会关闭相关用户连接
- 敏感凭据不通过实时事件推送
- 公开 MCP 仍走 HTTP，不暴露自定义 WebSocket 信封
- 生产环境应在反向代理层支持 WebSocket Upgrade，并配置空闲超时

## 后续接入

1. 通知与未读数订阅
2. MCP 状态、能力目录更新
3. 模型测试 / Agent 运行流式事件
4. 画布协同、选区与在线状态
5. 多实例事件总线（Redis / NATS）
6. 连接级限流、消息大小与慢客户端保护
