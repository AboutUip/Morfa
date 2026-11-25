# ADR 0007：单 WebSocket 实时通道

> 状态：已接受 · 日期：2026-11-26

## 背景

偏好同步最初使用 HTTP 快照 + focus/轮询，出现重复请求且不适合后续协同、通知与流式场景。Morfa 需要一个统一的实时传输层，同时避免把所有请求都塞进 WebSocket。

## 决策

1. **一条 WebSocket 连接，多路复用消息**：每个 Web 页面一条连接，不按模块拆多条。
2. **统一信封**：`v / id / type / module / action / payload / error / seq`。请求、响应、订阅和事件共用同一协议。
3. **操作注册表**：实时操作按 `module.action` 注册，调用与 HTTP 共用的 service；不复制业务逻辑。
4. **领域事件推送**：业务 service 发布用户级事件，网关按连接订阅推送；不直接操作 socket。
5. **传输边界**：高频、小体积、订阅、推送走 WebSocket；一次性、文件、敏感操作与公开 MCP 继续走 HTTP。
6. **鉴权与生命周期**：Session Cookie + Origin 校验；注销、改密、重置密码、注销账号关闭相关连接。
7. **客户端单例**：请求 ID、超时、pending map、自动重订阅、心跳、指数退避与 HTTP 回退。

## 结果

- `/api/me/preferences` 不再轮询；登录取一次快照，后续 `preferences.changed` 推送。
- 语言 / 主题在 MCP、HTTP 或另一 Tab 修改后，在线页面立即更新。
- 未来通知、Agent 流、模型测试进度、画布协同都接入同一网关。
- 实时协议作为内部 Web 客户端通道；外部 MCP 仍使用标准 HTTP JSON-RPC。
- 多实例部署需要把领域事件总线替换为 Redis / NATS，并保证连接所在实例能收到事件。
- WebSocket 代理、空闲超时、消息大小、连接限流与重放策略是后续运维重点。
