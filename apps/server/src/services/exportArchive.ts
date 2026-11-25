import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
} from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";

import {
  EXPORTS_DIR,
  EXPORT_JSON_MAX_BYTES,
  EXPORT_MASTER_KEY_FILE,
  DATA_DIR,
} from "../config.js";
import { ApiError } from "../lib/errors.js";

const ARCHIVE_MAGIC = Buffer.from("MORFA-EXPORT-1\n", "ascii");
const FILE_NAME_PATTERN = /^[a-f0-9-]{36}\.morfa$/i;
const MASTER_KEY_BYTES = 32;

interface EncryptedParts {
  data: string;
  iv: string;
  tag: string;
}

interface CryptoJson {
  version: number;
  wrappedKey: EncryptedParts;
  archive: {
    iv: string;
    tag: string;
  };
}

let cachedMasterKey: Buffer | null = null;

function parseMasterKey(value: string): Buffer | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const base64 = Buffer.from(trimmed, "base64");
  if (base64.length === MASTER_KEY_BYTES) return base64;

  if (/^[a-f0-9]{64}$/i.test(trimmed)) {
    return Buffer.from(trimmed, "hex");
  }

  return null;
}

export function getMasterKey(): Buffer {
  if (cachedMasterKey) return cachedMasterKey;

  const fromEnv = process.env.MORFA_EXPORT_MASTER_KEY;
  if (fromEnv) {
    const parsed = parseMasterKey(fromEnv);
    if (!parsed) {
      throw new ApiError(
        500,
        "EXPORT_KEY_INVALID",
        "导出主密钥格式不正确",
      );
    }
    cachedMasterKey = parsed;
    return parsed;
  }

  fs.mkdirSync(DATA_DIR, { recursive: true });

  if (fs.existsSync(EXPORT_MASTER_KEY_FILE)) {
    const parsed = parseMasterKey(
      fs.readFileSync(EXPORT_MASTER_KEY_FILE, "utf8"),
    );
    if (!parsed) {
      throw new ApiError(
        500,
        "EXPORT_KEY_INVALID",
        "本地导出主密钥已损坏",
      );
    }
    cachedMasterKey = parsed;
    return parsed;
  }

  const generated = randomBytes(MASTER_KEY_BYTES);
  fs.writeFileSync(EXPORT_MASTER_KEY_FILE, generated.toString("base64"), {
    mode: 0o600,
  });
  cachedMasterKey = generated;
  return generated;
}

function encryptGcm(key: Buffer, plaintext: Buffer) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  return { ciphertext, iv, tag };
}

function decryptGcm(
  key: Buffer,
  ciphertext: Buffer,
  iv: Buffer,
  tag: Buffer,
): Buffer {
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    throw new ApiError(
      400,
      "ARCHIVE_CORRUPTED",
      "数据包已损坏或无法解密",
    );
  }
}

function toBase64(value: Buffer) {
  return value.toString("base64");
}

function fromBase64(value: string, code: string): Buffer {
  if (typeof value !== "string" || value.length === 0) {
    throw new ApiError(400, code, "数据包已损坏");
  }

  return Buffer.from(value, "base64");
}

export function encryptArchive(payload: unknown): {
  fileBuffer: Buffer;
  cryptoJson: string;
  sha256: string;
} {
  const masterKey = getMasterKey();
  const dataKey = randomBytes(MASTER_KEY_BYTES);
  const json = Buffer.from(JSON.stringify(payload), "utf8");
  const compressed = gzipSync(json, { level: 9 });
  const archive = encryptGcm(dataKey, compressed);
  const fileBuffer = Buffer.concat([ARCHIVE_MAGIC, archive.ciphertext]);

  const wrapped = encryptGcm(masterKey, dataKey);
  const cryptoJson: CryptoJson = {
    version: 1,
    wrappedKey: {
      data: toBase64(wrapped.ciphertext),
      iv: toBase64(wrapped.iv),
      tag: toBase64(wrapped.tag),
    },
    archive: {
      iv: toBase64(archive.iv),
      tag: toBase64(archive.tag),
    },
  };

  return {
    fileBuffer,
    cryptoJson: JSON.stringify(cryptoJson),
    sha256: createHash("sha256").update(fileBuffer).digest("hex"),
  };
}

function parseCryptoJson(value: string): CryptoJson {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new ApiError(400, "ARCHIVE_CORRUPTED", "数据包已损坏");
  }

  const candidate = parsed as Partial<CryptoJson>;
  if (
    candidate.version !== 1 ||
    !candidate.wrappedKey ||
    !candidate.archive ||
    typeof candidate.wrappedKey.data !== "string" ||
    typeof candidate.wrappedKey.iv !== "string" ||
    typeof candidate.wrappedKey.tag !== "string" ||
    typeof candidate.archive.iv !== "string" ||
    typeof candidate.archive.tag !== "string"
  ) {
    throw new ApiError(400, "ARCHIVE_CORRUPTED", "数据包已损坏");
  }

  return candidate as CryptoJson;
}

export function decryptArchive(
  fileBuffer: Buffer,
  cryptoJson: string,
): unknown {
  if (
    fileBuffer.length <= ARCHIVE_MAGIC.length ||
    !fileBuffer
      .subarray(0, ARCHIVE_MAGIC.length)
      .equals(ARCHIVE_MAGIC)
  ) {
    throw new ApiError(400, "ARCHIVE_CORRUPTED", "数据包格式不正确");
  }

  const meta = parseCryptoJson(cryptoJson);
  const masterKey = getMasterKey();
  const dataKey = decryptGcm(
    masterKey,
    fromBase64(meta.wrappedKey.data, "ARCHIVE_CORRUPTED"),
    fromBase64(meta.wrappedKey.iv, "ARCHIVE_CORRUPTED"),
    fromBase64(meta.wrappedKey.tag, "ARCHIVE_CORRUPTED"),
  );

  const compressed = decryptGcm(
    dataKey,
    fileBuffer.subarray(ARCHIVE_MAGIC.length),
    fromBase64(meta.archive.iv, "ARCHIVE_CORRUPTED"),
    fromBase64(meta.archive.tag, "ARCHIVE_CORRUPTED"),
  );

  let json: Buffer;
  try {
    json = gunzipSync(compressed, { maxOutputLength: EXPORT_JSON_MAX_BYTES });
  } catch {
    throw new ApiError(
      400,
      "ARCHIVE_CORRUPTED",
      "数据包解压失败或内容过大",
    );
  }

  try {
    return JSON.parse(json.toString("utf8"));
  } catch {
    throw new ApiError(400, "ARCHIVE_CORRUPTED", "数据包内容格式不正确");
  }
}

export function createExportFileName(): string {
  return `${randomUUID()}.morfa`;
}

export function exportFilePath(fileName: string): string {
  if (!FILE_NAME_PATTERN.test(fileName)) {
    throw new ApiError(400, "EXPORT_FILE_INVALID", "导出文件名称不正确");
  }

  return path.join(EXPORTS_DIR, fileName);
}

export async function writeExportFile(
  fileName: string,
  fileBuffer: Buffer,
): Promise<void> {
  await fsp.mkdir(EXPORTS_DIR, { recursive: true });
  await fsp.writeFile(exportFilePath(fileName), fileBuffer);
}

export async function deleteExportFile(fileName: string): Promise<void> {
  try {
    await fsp.rm(exportFilePath(fileName), { force: true });
  } catch {
    // 清理失败不影响主流程，文件会在后续导出或维护中回收。
  }
}

export function sha256Hex(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}
