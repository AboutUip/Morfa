import fs from "node:fs/promises";
import path from "node:path";

import {
  AVATAR_MAX_BYTES,
  AVATARS_DIR,
  AVATAR_MIME_TYPES,
  DATA_DIR,
} from "../config.js";
import { ApiError } from "../lib/errors.js";

type AvatarMime = (typeof AVATAR_MIME_TYPES)[number];

const EXTENSIONS: Record<AvatarMime, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

function isAvatarMime(value: string): value is AvatarMime {
  return (AVATAR_MIME_TYPES as readonly string[]).includes(value);
}

function matchesImageSignature(buffer: Buffer, mime: AvatarMime): boolean {
  if (mime === "image/png") {
    return (
      buffer.length >= PNG_SIGNATURE.length &&
      buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)
    );
  }

  if (mime === "image/jpeg") {
    return (
      buffer.length >= 3 &&
      buffer[0] === 0xff &&
      buffer[1] === 0xd8 &&
      buffer[2] === 0xff
    );
  }

  return (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  );
}

export function assertAvatar(
  buffer: Buffer | null,
  mimeType: string,
): asserts buffer is Buffer {
  if (!buffer || buffer.length === 0) {
    throw new ApiError(400, "AVATAR_REQUIRED", "请上传头像文件");
  }

  if (buffer.length > AVATAR_MAX_BYTES) {
    throw new ApiError(413, "AVATAR_TOO_LARGE", "头像文件不能超过 2 MB");
  }

  if (!isAvatarMime(mimeType)) {
    throw new ApiError(400, "AVATAR_TYPE", "头像仅支持 PNG、JPG 或 WebP");
  }

  if (!matchesImageSignature(buffer, mimeType)) {
    throw new ApiError(400, "AVATAR_TYPE", "头像文件内容与格式不匹配");
  }
}

export async function saveAvatar(
  userId: string,
  buffer: Buffer,
  mimeType: string,
): Promise<string> {
  if (!isAvatarMime(mimeType)) {
    throw new ApiError(400, "AVATAR_TYPE", "头像仅支持 PNG、JPG 或 WebP");
  }

  await fs.mkdir(AVATARS_DIR, { recursive: true });

  const relativePath = `uploads/avatars/${userId}.${EXTENSIONS[mimeType]}`;
  await fs.writeFile(path.join(DATA_DIR, relativePath), buffer);
  return relativePath;
}

export async function deleteAvatar(relativePath: string): Promise<void> {
  const absolutePath = path.resolve(DATA_DIR, relativePath);
  const root = `${path.resolve(AVATARS_DIR)}${path.sep}`;

  if (!absolutePath.startsWith(root)) return;
  await fs.rm(absolutePath, { force: true });
}

export function avatarUrl(relativePath: string): string {
  return `/${relativePath.replaceAll("\\", "/")}`;
}

export function mimeTypeForAvatarFile(filename: string): string | null {
  if (filename.endsWith(".png")) return "image/png";
  if (filename.endsWith(".jpg")) return "image/jpeg";
  if (filename.endsWith(".webp")) return "image/webp";
  return null;
}
