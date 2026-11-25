import fs from "node:fs";

import multipart from "@fastify/multipart";
import Fastify from "fastify";

import { registerAuthRoutes } from "./api/auth.js";
import { registerUploadRoutes } from "./api/uploads.js";
import {
  AVATARS_DIR,
  AVATAR_MAX_BYTES,
  HOST,
  PORT,
} from "./config.js";
import { db } from "./db/connection.js";
import { migrate } from "./db/migrate.js";
import { deleteExpiredSessions } from "./db/users.js";
import { ApiError } from "./lib/errors.js";

fs.mkdirSync(AVATARS_DIR, { recursive: true });
migrate();
deleteExpiredSessions();

const app = Fastify({
  logger: {
    level: process.env.LOG_LEVEL ?? "info",
  },
});

await app.register(multipart, {
  limits: {
    fileSize: AVATAR_MAX_BYTES,
    files: 1,
    fields: 10,
    fieldSize: 4096,
    parts: 12,
  },
});

app.get("/api/health", async () => ({ ok: true }));

registerAuthRoutes(app);
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
      error: { code: "AVATAR_TOO_LARGE", message: "头像文件不能超过 2 MB" },
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
  await app.close();
  db.close();
};

process.once("SIGINT", () => void close().finally(() => process.exit(0)));
process.once("SIGTERM", () => void close().finally(() => process.exit(0)));

await app.listen({ host: HOST, port: PORT });
app.log.info(`Morfa API listening on http://${HOST}:${PORT}`);
