import fs from "node:fs";

import multipart from "@fastify/multipart";
import websocket from "@fastify/websocket";
import Fastify from "fastify";

import { registerAccountRoutes } from "./api/account.js";
import { registerApiKeyRoutes } from "./api/apiKeys.js";
import { registerAuthRoutes } from "./api/auth.js";
import { registerMcpRoutes } from "./api/mcp.js";
import { registerModelProviderRoutes } from "./api/modelProviders.js";
import { registerPreferencesRoutes } from "./api/preferences.js";
import { registerProjectRoutes } from "./api/projects.js";
import { registerRealtimeRoutes } from "./api/realtime.js";
import { registerUploadRoutes } from "./api/uploads.js";
import {
  AVATARS_DIR,
  EXPORTS_DIR,
  EXPORT_ARCHIVE_MAX_BYTES,
  HOST,
  PORT,
  PROJECT_ICONS_DIR,
} from "./config.js";
import { db } from "./db/connection.js";
import { migrate } from "./db/migrate.js";
import { deleteExpiredSessions } from "./db/users.js";
import {
  purgeExpiredSetupTokens,
  purgeExpiredTickets,
} from "./db/vcode.js";
import {
  initializeAutomation,
  stopAutomation,
} from "./automation/index.js";
import { ApiError } from "./lib/errors.js";
import { mcpController } from "./mcp/runtime.js";
import {
  initializeRealtimeOperations,
  realtimeGateway,
} from "./realtime/index.js";

fs.mkdirSync(AVATARS_DIR, { recursive: true });
fs.mkdirSync(PROJECT_ICONS_DIR, { recursive: true });
fs.mkdirSync(EXPORTS_DIR, { recursive: true });
migrate();
deleteExpiredSessions();
purgeExpiredSetupTokens(Date.now());
purgeExpiredTickets(Date.now());

const app = Fastify({
  logger: {
    level: process.env.LOG_LEVEL ?? "info",
  },
});

await app.register(multipart, {
  limits: {
    fileSize: EXPORT_ARCHIVE_MAX_BYTES,
    files: 2,
    fields: 24,
    fieldSize: 8192,
    parts: 28,
  },
});
await app.register(websocket, {
  options: {
    maxPayload: 256 * 1024,
  },
});

app.get("/api/health", async () => ({ ok: true }));

initializeRealtimeOperations();

registerAuthRoutes(app);
registerAccountRoutes(app);
registerPreferencesRoutes(app);
registerApiKeyRoutes(app);
registerModelProviderRoutes(app);
registerProjectRoutes(app);
registerMcpRoutes(app, mcpController);
registerRealtimeRoutes(app);
registerUploadRoutes(app);

app.setErrorHandler((error, request, reply) => {
  if (error instanceof ApiError) {
    return reply.status(error.statusCode).send({
      error: { code: error.code, message: error.message },
    });
  }

  const code = (error as { code?: string }).code;

  if (code === "FST_REQ_FILE_TOO_LARGE") {
    return reply.status(413).send({
      error: { code: "FILE_TOO_LARGE", message: "文件大小超出限制" },
    });
  }

  if (code === "FST_INVALID_MULTIPART_CONTENT_TYPE") {
    return reply.status(400).send({
      error: { code: "INVALID_INPUT", message: "请求格式不正确" },
    });
  }

  const statusCode = (error as { statusCode?: number }).statusCode;
  if (statusCode && statusCode >= 400 && statusCode < 500) {
    return reply.status(statusCode).send({
      error: { code: "INVALID_REQUEST", message: "请求格式不正确" },
    });
  }

  request.log.error({ err: error }, "request failed");
  return reply.status(500).send({
    error: { code: "INTERNAL_ERROR", message: "服务器内部错误" },
  });
});

const close = async () => {
  stopAutomation();
  realtimeGateway.closeAll();
  await app.close();
  db.close();
};

process.once("SIGINT", () => void close().finally(() => process.exit(0)));
process.once("SIGTERM", () => void close().finally(() => process.exit(0)));

initializeAutomation();
await app.listen({ host: HOST, port: PORT });
app.log.info(`Morfa API listening on http://${HOST}:${PORT}`);
