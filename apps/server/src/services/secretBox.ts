import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

import { ApiError } from "../lib/errors.js";
import { getMasterKey } from "./exportArchive.js";

const VERSION = "v1";
const IV_BYTES = 12;

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", getMasterKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    VERSION,
    iv.toString("base64"),
    tag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(".");
}

export function decryptSecret(payload: string): string {
  const [version, ivValue, tagValue, ciphertextValue] = payload.split(".");
  if (
    version !== VERSION ||
    !ivValue ||
    !tagValue ||
    !ciphertextValue
  ) {
    throw new ApiError(
      500,
      "SECRET_CORRUPT",
      "服务器密钥数据无法读取",
    );
  }

  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      getMasterKey(),
      Buffer.from(ivValue, "base64"),
    );
    decipher.setAuthTag(Buffer.from(tagValue, "base64"));

    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextValue, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      500,
      "SECRET_CORRUPT",
      "服务器密钥数据无法读取",
    );
  }
}
