# ADR 0006：原生 MCP 与 API Key 权限模型

> 状态：已接受 · 日期：2026-11-26
>
> English: [0006-native-mcp_en.md](0006-native-mcp_en.md)

## 背景

Morfa 需要把账号、外观、导出与模型供应商能力开放给 MCP 客户端和内部模块。敏感能力已经使用 VCode 或当前密码保护，但外部 API Key 无法直接复用网页会话，也不能把密钥本身当作完整账号权限。

## 决策

1. **原生 MCP 服务端**：在 API 服务中实现 `POST /mcp`，使用 JSON-RPC 2.0，无状态鉴权；不引入独立 MCP 进程。
2. **独立总控**：所有能力由 `src/mcp/McpController` 注册与执行，统一处理参数 schema、权限、`tools/list` 过滤、`tools/call` 结果与 `llms.txt` 生成。新模块只注册能力定义。
3. **API Key**：创建时返回一次明文，数据库只保存 SHA-256 哈希与展示前缀。每个 Key 有两个独立权限位：
   - VCode 敏感能力：调用时必须传 `vcode`；
   - 密码敏感能力：调用时必须传当前账号 `password`。
   同时需要两项的能力要求 Key 同时开启两个权限位。
4. **发现能力**：`tools/list` 只返回当前 Key 可调用的能力；`search_mcp_capabilities` / `get_mcp_capability` 可查询被锁定的能力及要求。另提供共用同一控制器的 REST 发现与调用 API。
5. **偏好同步**：语言与主题写入 `user_preferences`；网页登录后读取一次快照，并通过实时通道订阅 `preferences.changed`；MCP 修改后由服务端直接推送到在线页面。

## 结果

- 外部 MCP 客户端和内部模块共享同一套能力定义与权限校验，不会出现两套行为。
- 新增能力只需编写定义与执行函数；敏感能力忘记声明参数时，总控仍会强制校验 `vcode` / `password`。
- API Key 不能提权、不能查看其他 Key，注销账号时随会话一并删除。
- 当前 MCP 传输是无状态 JSON 响应；如后续需要服务端主动通知，可在不改变能力注册表的前提下增加 SSE 会话层。
- 生产部署需要把 `/mcp`、`/llms.txt`、`/api` 与 `/uploads` 统一反向代理到 API 服务，并通过 `APP_ORIGIN` 固定外部地址。
