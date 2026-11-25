import { createMcpController } from "./index.js";

/**
 * 进程内共享的 MCP 总控。
 *
 * 其他服务模块可以：
 * 1. 通过 `mcpController.register()` 注册能力；
 * 2. 通过 `mcpController.invoke()` 以同一套权限与参数校验执行能力。
 */
export const mcpController = createMcpController();
