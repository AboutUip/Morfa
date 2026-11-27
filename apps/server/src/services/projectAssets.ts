import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { ASSETS_DIR } from "../config.js";
import {
  deleteProjectAssetRecord,
  insertProjectAssetRecord,
  listProjectAssetRows,
  listProjectAssetStorageNames as listStoredAssetNames,
  type ProjectAssetRow,
} from "../db/projectAssets.js";
import { findProjectDataForUser } from "../db/projects.js";
import { ApiError } from "../lib/errors.js";

export const MAX_PROJECT_ASSET_BYTES = 4 * 1024 * 1024;
const MAX_ASSET_NAME_LENGTH = 160;
const MAX_ASSET_DATA_URL_LENGTH = 6_000_000;

type AssetMime =
  | "image/png"
  | "image/jpeg"
  | "image/webp"
  | "image/gif";

const EXTENSIONS: Record<AssetMime, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

const DATA_URL_PATTERN =
  /^data:(image\/(?:png|jpeg|webp|gif));base64,([a-zA-Z0-9+/=\s]+)$/i;

function isBase64Character(code: number): boolean {
  return (
    (code >= 65 && code <= 90) ||
    (code >= 97 && code <= 122) ||
    (code >= 48 && code <= 57) ||
    code === 43 ||
    code === 47
  );
}

function isValidBase64(value: string): boolean {
  if (!value || value.length % 4 !== 0) return false;

  const padding = value.endsWith("==")
    ? 2
    : value.endsWith("=")
      ? 1
      : 0;
  const end = value.length - padding;

  for (let index = 0; index < end; index += 1) {
    if (!isBase64Character(value.charCodeAt(index))) return false;
  }

  return true;
}

export interface ProjectAssetDto {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  path: string;
  createdAt: number;
}

export interface CreateProjectAssetInput {
  name?: string | null;
  dataUrl: string;
}

function isAssetMime(value: string): value is AssetMime {
  return Object.prototype.hasOwnProperty.call(EXTENSIONS, value);
}

function matchesImageSignature(
  buffer: Buffer,
  mimeType: AssetMime,
): boolean {
  if (mimeType === "image/png") {
    return (
      buffer.length >= PNG_SIGNATURE.length &&
      buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)
    );
  }

  if (mimeType === "image/jpeg") {
    return (
      buffer.length >= 3 &&
      buffer[0] === 0xff &&
      buffer[1] === 0xd8 &&
      buffer[2] === 0xff
    );
  }

  if (mimeType === "image/gif") {
    const header = buffer.toString("ascii", 0, 6);
    return header === "GIF87a" || header === "GIF89a";
  }

  return (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  );
}

function parseAssetDataUrl(value: string): {
  buffer: Buffer;
  mimeType: AssetMime;
  extension: string;
} {
  if (!value) {
    throw new ApiError(
      400,
      "ASSET_DATA_URL_REQUIRED",
      "请提供素材的 base64 data URL",
    );
  }

  if (value.length > MAX_ASSET_DATA_URL_LENGTH) {
    throw new ApiError(
      413,
      "ASSET_TOO_LARGE",
      "素材不能超过 4 MB",
    );
  }

  const match = DATA_URL_PATTERN.exec(value);
  if (!match) {
    throw new ApiError(
      400,
      "ASSET_DATA_URL_INVALID",
      "素材必须是 PNG、JPG、WebP 或 GIF 的 base64 data URL",
    );
  }

  const mimeType = match[1].toLowerCase();
  if (!isAssetMime(mimeType)) {
    throw new ApiError(
      400,
      "ASSET_TYPE_INVALID",
      "素材仅支持 PNG、JPG、WebP 或 GIF",
    );
  }

  const base64 = match[2].replace(/\s/g, "");
  if (!isValidBase64(base64)) {
    throw new ApiError(
      400,
      "ASSET_DATA_URL_INVALID",
      "素材 base64 内容不正确",
    );
  }

  const buffer = Buffer.from(base64, "base64");
  if (buffer.length === 0) {
    throw new ApiError(400, "ASSET_EMPTY", "素材内容为空");
  }

  if (buffer.length > MAX_PROJECT_ASSET_BYTES) {
    throw new ApiError(
      413,
      "ASSET_TOO_LARGE",
      "素材不能超过 4 MB",
    );
  }

  if (!matchesImageSignature(buffer, mimeType)) {
    throw new ApiError(
      400,
      "ASSET_TYPE_INVALID",
      "素材内容与声明格式不匹配",
    );
  }

  return {
    buffer,
    mimeType,
    extension: EXTENSIONS[mimeType],
  };
}

function sanitizeAssetName(
  value: string | null | undefined,
  id: string,
  extension: string,
): string {
  const cleaned =
    typeof value === "string"
      ? value
          .replace(/[\u0000-\u001f\u007f]/g, "")
          .replace(/[\\/]+/g, "-")
          .trim()
      : "";

  if (!cleaned) {
    return `asset-${id.slice(0, 8)}.${extension}`;
  }

  return Array.from(cleaned).slice(0, MAX_ASSET_NAME_LENGTH).join("");
}

function assertProjectAccess(userId: string, projectId: string) {
  if (!findProjectDataForUser(userId, projectId)) {
    throw new ApiError(404, "PROJECT_NOT_FOUND", "项目不存在");
  }
}

function toProjectAssetDto(row: ProjectAssetRow): ProjectAssetDto {
  return {
    id: row.id,
    name: row.name,
    mimeType: row.mime_type,
    size: row.size,
    path: assetPublicPath(row.storage_name),
    createdAt: row.created_at,
  };
}

export function assetPublicPath(storageName: string): string {
  return `/uploads/assets/${storageName}`;
}

export function mimeTypeForAssetFile(filename: string): string | null {
  if (filename.endsWith(".png")) return "image/png";
  if (filename.endsWith(".jpg")) return "image/jpeg";
  if (filename.endsWith(".webp")) return "image/webp";
  if (filename.endsWith(".gif")) return "image/gif";
  return null;
}

export function listProjectAssets(
  userId: string,
  projectId: string,
): ProjectAssetDto[] {
  assertProjectAccess(userId, projectId);
  return listProjectAssetRows(projectId).map(toProjectAssetDto);
}

export async function createProjectAsset(
  userId: string,
  projectId: string,
  input: CreateProjectAssetInput,
): Promise<ProjectAssetDto> {
  assertProjectAccess(userId, projectId);

  const { buffer, mimeType, extension } = parseAssetDataUrl(
    input.dataUrl,
  );
  const id = randomUUID();
  const name = sanitizeAssetName(input.name, id, extension);
  const storageName = `${id}.${extension}`;
  const filePath = path.join(ASSETS_DIR, storageName);
  const createdAt = Date.now();

  await fs.mkdir(ASSETS_DIR, { recursive: true });
  await fs.writeFile(filePath, buffer);

  try {
    insertProjectAssetRecord({
      id,
      projectId,
      name,
      storageName,
      mimeType,
      size: buffer.length,
      createdAt,
    });
  } catch (error) {
    await fs.rm(filePath, { force: true }).catch(() => {
      // 数据库写入失败时尽力清理已保存的素材文件
    });
    throw error;
  }

  return {
    id,
    name,
    mimeType,
    size: buffer.length,
    path: assetPublicPath(storageName),
    createdAt,
  };
}

export async function deleteProjectAsset(
  userId: string,
  projectId: string,
  assetId: string,
): Promise<{ id: string; deleted: boolean }> {
  assertProjectAccess(userId, projectId);

  const row = deleteProjectAssetRecord(projectId, assetId);
  if (!row) {
    throw new ApiError(404, "ASSET_NOT_FOUND", "素材不存在");
  }

  await fs
    .rm(path.join(ASSETS_DIR, row.storage_name), { force: true })
    .catch(() => {
      // 数据库记录删除后，文件清理失败不阻塞结果
    });

  return { id: assetId, deleted: true };
}

export async function deleteProjectAssetFiles(
  projectId: string,
  storageNames: string[] = listStoredAssetNames(projectId),
): Promise<void> {
  await Promise.all(
    storageNames.map(async (storageName) => {
      await fs
        .rm(path.join(ASSETS_DIR, storageName), { force: true })
        .catch(() => {
          // 文件不存在或清理失败时忽略
        });
    }),
  );
}
