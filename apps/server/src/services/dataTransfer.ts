import { randomUUID } from "node:crypto";

import { EXPORT_FORMAT_VERSION } from "../config.js";
import {
  findLatestExportByAccount,
  findValidExportByUser,
  insertExport,
  invalidateValidExportsForUser,
  markExportConsumed,
  type ExportRow,
} from "../db/exports.js";
import {
  insertProjectsForUser,
  listProjectsForUser,
  type ImportedProject,
} from "../db/projects.js";
import { transaction } from "../db/transaction.js";
import { findUserByAccount, type UserRow } from "../db/users.js";
import { ApiError } from "../lib/errors.js";
import { consumeTicketOrThrow } from "./vcode.js";
import {
  createExportFileName,
  decryptArchive,
  deleteExportFile,
  encryptArchive,
  sha256Hex,
  writeExportFile,
} from "./exportArchive.js";

export const EXPORT_DOWNLOAD_URL = "/api/me/export/download";
const MAX_IMPORTED_PROJECTS = 200;
const MAX_PROJECT_NAME_LENGTH = 120;
const MAX_PROJECT_DATA_LENGTH = 200_000;
const MAX_TOTAL_PROJECT_DATA_LENGTH = 8 * 1024 * 1024;

export interface ExportSummary {
  createdAt: number;
  fileSize: number;
  downloadUrl: string;
}

interface ExportPayload {
  format: string;
  version: number;
  exportedAt: number;
  originalUserId: string;
  originalLoginAccount: string;
  projects: Array<{
    name: string;
    data: string;
    createdAt: number;
    updatedAt: number;
  }>;
}

export interface PreparedImport {
  exportId: string;
  archiveFileName: string;
  projects: ImportedProject[];
}

function toSummary(row: ExportRow): ExportSummary {
  return {
    createdAt: row.created_at,
    fileSize: row.file_size,
    downloadUrl: EXPORT_DOWNLOAD_URL,
  };
}

export function getExportSummary(userId: string): ExportSummary | null {
  const row = findValidExportByUser(userId);
  return row ? toSummary(row) : null;
}

export function getValidExportRow(userId: string): ExportRow | undefined {
  return findValidExportByUser(userId);
}

export async function createExportForUser(
  user: UserRow,
  ticket: string,
): Promise<ExportSummary> {
  const projects = listProjectsForUser(user.id).map((project) => ({
    name: project.name,
    data: project.data,
    createdAt: project.created_at,
    updatedAt: project.updated_at,
  }));

  const payload: ExportPayload = {
    format: "morfa-export",
    version: EXPORT_FORMAT_VERSION,
    exportedAt: Date.now(),
    originalUserId: user.id,
    originalLoginAccount: user.login_account,
    projects,
  };

  const { fileBuffer, cryptoJson, sha256 } = encryptArchive(payload);
  const fileName = createExportFileName();
  const createdAt = Date.now();

  await writeExportFile(fileName, fileBuffer);

  let oldRows: ExportRow[] = [];

  try {
    transaction(() => {
      consumeTicketOrThrow(user.id, "export", ticket);

      oldRows = invalidateValidExportsForUser(user.id, createdAt);

      insertExport({
        id: randomUUID(),
        userId: user.id,
        originalLoginAccount: user.login_account,
        fileName,
        fileSize: fileBuffer.length,
        sha256,
        cryptoJson,
        formatVersion: EXPORT_FORMAT_VERSION,
        createdAt,
      });
    });
  } catch (error) {
    await deleteExportFile(fileName);
    throw error;
  }

  await Promise.all(oldRows.map((row) => deleteExportFile(row.file_name)));

  return {
    createdAt,
    fileSize: fileBuffer.length,
    downloadUrl: EXPORT_DOWNLOAD_URL,
  };
}

function parseProject(
  value: unknown,
  totalDataLength: { value: number },
): ImportedProject {
  if (!value || typeof value !== "object") {
    throw new ApiError(400, "ARCHIVE_CORRUPTED", "数据包内容格式不正确");
  }

  const project = value as Record<string, unknown>;
  const name = typeof project.name === "string" ? project.name.trim() : "";
  const data = typeof project.data === "string" ? project.data : "";
  const createdAt =
    typeof project.createdAt === "number" && Number.isFinite(project.createdAt)
      ? project.createdAt
      : Date.now();
  const updatedAt =
    typeof project.updatedAt === "number" && Number.isFinite(project.updatedAt)
      ? project.updatedAt
      : createdAt;

  if (
    !name ||
    name.length > MAX_PROJECT_NAME_LENGTH ||
    data.length > MAX_PROJECT_DATA_LENGTH
  ) {
    throw new ApiError(400, "ARCHIVE_CORRUPTED", "数据包内容格式不正确");
  }

  totalDataLength.value += data.length;
  if (totalDataLength.value > MAX_TOTAL_PROJECT_DATA_LENGTH) {
    throw new ApiError(413, "ARCHIVE_TOO_LARGE", "数据包内容过大");
  }

  return { name, data, createdAt, updatedAt };
}

function parsePayload(
  payload: unknown,
  originalUserId: string,
  originalLoginAccount: string,
): ImportedProject[] {
  if (!payload || typeof payload !== "object") {
    throw new ApiError(400, "ARCHIVE_CORRUPTED", "数据包内容格式不正确");
  }

  const data = payload as Partial<ExportPayload>;

  if (data.format !== "morfa-export") {
    throw new ApiError(400, "ARCHIVE_CORRUPTED", "数据包格式不正确");
  }

  if (data.version !== EXPORT_FORMAT_VERSION) {
    throw new ApiError(
      400,
      "ARCHIVE_UNSUPPORTED_VERSION",
      "数据包版本不受支持",
    );
  }

  if (
    data.originalUserId !== originalUserId ||
    typeof data.originalLoginAccount !== "string" ||
    data.originalLoginAccount.toLowerCase() !== originalLoginAccount
  ) {
    throw new ApiError(
      400,
      "ARCHIVE_MISMATCH",
      "数据包与提供的原登录账号不匹配",
    );
  }

  if (!Array.isArray(data.projects)) {
    throw new ApiError(400, "ARCHIVE_CORRUPTED", "数据包内容格式不正确");
  }

  if (data.projects.length > MAX_IMPORTED_PROJECTS) {
    throw new ApiError(413, "ARCHIVE_TOO_LARGE", "数据包包含的项目过多");
  }

  const totalDataLength = { value: 0 };
  return data.projects.map((project) =>
    parseProject(project, totalDataLength),
  );
}

export function prepareImport(
  originalAccountInput: string,
  archiveBuffer: Buffer,
): PreparedImport {
  const originalAccount = originalAccountInput.trim().toLowerCase();

  if (!originalAccount) {
    throw new ApiError(
      400,
      "IMPORT_ACCOUNT_REQUIRED",
      "请输入原登录账号",
    );
  }

  if (archiveBuffer.length === 0) {
    throw new ApiError(400, "IMPORT_ARCHIVE_REQUIRED", "请选择数据包");
  }

  const originalUser = findUserByAccount(originalAccount);
  if (!originalUser) {
    throw new ApiError(
      404,
      "ORIGINAL_ACCOUNT_NOT_FOUND",
      "找不到该原登录账号",
    );
  }

  if (originalUser.status !== "cancelled") {
    throw new ApiError(
      409,
      "ORIGINAL_ACCOUNT_ACTIVE",
      "原登录账号尚未注销，不能导入",
    );
  }

  const exportRow = findLatestExportByAccount(originalAccount);
  if (!exportRow) {
    throw new ApiError(404, "EXPORT_NOT_FOUND", "原账号没有可用的导出包");
  }

  if (exportRow.consumed_at) {
    throw new ApiError(409, "EXPORT_CONSUMED", "该数据包已经被使用过");
  }

  if (exportRow.invalidated_at) {
    throw new ApiError(
      409,
      "EXPORT_INVALIDATED",
      "该数据包已被新的导出包覆盖",
    );
  }

  if (sha256Hex(archiveBuffer) !== exportRow.sha256) {
    throw new ApiError(
      400,
      "ARCHIVE_CORRUPTED",
      "数据包校验失败，文件可能已损坏",
    );
  }

  const payload = decryptArchive(archiveBuffer, exportRow.crypto_json);
  const projects = parsePayload(
    payload,
    originalUser.id,
    originalAccount,
  );

  return {
    exportId: exportRow.id,
    archiveFileName: exportRow.file_name,
    projects,
  };
}

export function consumePreparedImport(input: {
  prepared: PreparedImport;
  newUserId: string;
  now: number;
}) {
  insertProjectsForUser(input.newUserId, input.prepared.projects);

  const consumed = markExportConsumed({
    exportId: input.prepared.exportId,
    newUserId: input.newUserId,
    now: input.now,
  });

  if (!consumed) {
    throw new ApiError(409, "EXPORT_CONSUMED", "该数据包已经被使用过");
  }
}

export async function discardPreparedImportFile(prepared: PreparedImport) {
  await deleteExportFile(prepared.archiveFileName);
}
