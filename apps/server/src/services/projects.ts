import { randomBytes, randomUUID } from "node:crypto";

import type { UserRow } from "../db/users.js";
import {
  addProjectMember,
  countOwnedProjects,
  findProjectCardByRequestId,
  findProjectCardByShareCode,
  findProjectCardForUser,
  findPublicProjectCard,
  insertProjectRecord,
  listProjectCardsForUser,
  type ProjectCardRow,
  type ProjectType,
  type ProjectVisibility,
} from "../db/projects.js";
import { ApiError } from "../lib/errors.js";
import {
  assertProjectIcon,
  deleteProjectIcon,
  projectIconUrl,
  saveProjectIcon,
} from "./projectIcons.js";

const MAX_PROJECTS_PER_USER = 50;
const MAX_NAME_LENGTH = 80;
const MAX_DESCRIPTION_LENGTH = 500;
const SHARE_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const SHARE_CODE_LENGTH = 8;
const REQUEST_ID_PATTERN = /^[a-zA-Z0-9_-]{8,80}$/;

export interface CreateProjectInput {
  type: string;
  name: string;
  description: string;
  visibility: string;
  iconDataUrl?: string | null;
  requestId?: string | null;
}

export interface ProjectDto {
  id: string;
  name: string;
  description: string;
  type: ProjectType;
  visibility: ProjectVisibility;
  iconUrl: string | null;
  shareCode: string | null;
  role: "owner" | "member";
  ownerName: string;
  createdAt: number;
  updatedAt: number;
}

interface NormalizedProjectInput {
  type: ProjectType;
  name: string;
  description: string;
  visibility: ProjectVisibility;
  iconDataUrl: string | null;
  requestId: string | null;
}

function normalizeType(value: string): ProjectType {
  if (value === "software" || value === "website") return value;
  throw new ApiError(400, "PROJECT_TYPE_INVALID", "项目类型不正确");
}

function normalizeVisibility(value: string): ProjectVisibility {
  if (
    value === "public" ||
    value === "private" ||
    value === "shared"
  ) {
    return value;
  }
  throw new ApiError(400, "PROJECT_VISIBILITY_INVALID", "项目可见性不正确");
}

function normalizeName(value: string): string {
  const name = value.trim();
  if (!name) {
    throw new ApiError(400, "PROJECT_NAME_REQUIRED", "请输入项目名");
  }
  if (name.length > MAX_NAME_LENGTH) {
    throw new ApiError(
      400,
      "PROJECT_NAME_TOO_LONG",
      "项目名不能超过 80 个字符",
    );
  }
  return name;
}

function normalizeDescription(value: string): string {
  const description = value.trim();
  if (!description) {
    throw new ApiError(
      400,
      "PROJECT_DESCRIPTION_REQUIRED",
      "请输入项目介绍",
    );
  }
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    throw new ApiError(
      400,
      "PROJECT_DESCRIPTION_TOO_LONG",
      "项目介绍不能超过 500 个字符",
    );
  }
  return description;
}

function normalizeRequestId(value: string | null | undefined): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (!REQUEST_ID_PATTERN.test(value)) {
    throw new ApiError(
      400,
      "PROJECT_REQUEST_INVALID",
      "项目创建请求标识不正确",
    );
  }
  return value;
}

function createShareCode(): string {
  const bytes = randomBytes(SHARE_CODE_LENGTH);
  let code = "";
  for (let i = 0; i < SHARE_CODE_LENGTH; i += 1) {
    code += SHARE_CODE_ALPHABET[bytes[i] % SHARE_CODE_ALPHABET.length];
  }
  return code;
}

function parseIconDataUrl(
  value: string | null | undefined,
): { buffer: Buffer; mimeType: string } | null {
  if (!value) return null;

  const match = /^data:(image\/(?:png|jpeg|webp));base64,([a-zA-Z0-9+/=\s]+)$/.exec(
    value,
  );
  if (!match) {
    throw new ApiError(
      400,
      "PROJECT_ICON_TYPE",
      "项目图标仅支持 PNG、JPG 或 WebP",
    );
  }

  const mimeType = match[1];
  const buffer = Buffer.from(match[2].replace(/\s/g, ""), "base64");
  assertProjectIcon(buffer, mimeType);
  return { buffer, mimeType };
}

export function normalizeCreateProjectInput(
  input: CreateProjectInput,
): NormalizedProjectInput {
  return {
    type: normalizeType(input.type),
    name: normalizeName(input.name),
    description: normalizeDescription(input.description),
    visibility: normalizeVisibility(input.visibility),
    iconDataUrl: input.iconDataUrl ?? null,
    requestId: normalizeRequestId(input.requestId),
  };
}

function toProjectDto(
  row: ProjectCardRow,
  viewerId: string,
): ProjectDto {
  const isOwner = row.user_id === viewerId;
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    type: row.project_type,
    visibility: row.visibility,
    iconUrl: row.icon_path ? projectIconUrl(row.icon_path) : null,
    shareCode:
      isOwner && row.visibility !== "private" ? row.share_code : null,
    role: isOwner ? "owner" : "member",
    ownerName: row.owner_nickname,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function getProjectDtoOrThrow(
  userId: string,
  projectId: string,
): ProjectDto {
  const row = findProjectCardForUser(userId, projectId);
  if (!row) {
    throw new ApiError(404, "PROJECT_NOT_FOUND", "项目不存在");
  }
  return toProjectDto(row, userId);
}

export function listProjects(userId: string): ProjectDto[] {
  return listProjectCardsForUser(userId).map((row) =>
    toProjectDto(row, userId),
  );
}

export async function createProject(
  user: UserRow,
  input: CreateProjectInput,
): Promise<ProjectDto> {
  const normalized = normalizeCreateProjectInput(input);

  if (normalized.requestId) {
    const existing = findProjectCardByRequestId(
      user.id,
      normalized.requestId,
    );
    if (existing) return toProjectDto(existing, user.id);
  }

  if (countOwnedProjects(user.id) >= MAX_PROJECTS_PER_USER) {
    throw new ApiError(
      409,
      "PROJECT_LIMIT_REACHED",
      "项目数量已达上限",
    );
  }

  const icon = parseIconDataUrl(normalized.iconDataUrl);
  let iconPath: string | null = null;
  if (icon) {
    iconPath = await saveProjectIcon(icon.buffer, icon.mimeType);
  }

  const now = Date.now();
  const id = randomUUID();
  const needsShareCode = normalized.visibility !== "private";

  try {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const shareCode = needsShareCode ? createShareCode() : null;
      try {
        insertProjectRecord({
          id,
          userId: user.id,
          name: normalized.name,
          description: normalized.description,
          projectType: normalized.type,
          visibility: normalized.visibility,
          iconPath,
          shareCode,
          clientRequestId: normalized.requestId,
          data: "{}",
          now,
        });
        return getProjectDtoOrThrow(user.id, id);
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        if (
          needsShareCode &&
          message.includes("projects.share_code") &&
          attempt < 4
        ) {
          continue;
        }
        throw error;
      }
    }

    throw new ApiError(
      500,
      "PROJECT_CREATE_FAILED",
      "项目创建失败",
    );
  } catch (error) {
    if (iconPath) {
      await deleteProjectIcon(iconPath).catch(() => {
        // 数据库失败时尽力清理已保存的图标
      });
    }
    throw error;
  }
}

export function joinProject(
  user: UserRow,
  rawCode: string,
): ProjectDto {
  const code = rawCode.trim();
  if (!code) {
    throw new ApiError(400, "PROJECT_CODE_REQUIRED", "请输入项目邀请码");
  }

  const upper = code.toUpperCase();
  const byCode = findProjectCardByShareCode(user.id, upper);
  const byId =
    byCode ??
    findPublicProjectCard(user.id, code) ??
    findPublicProjectCard(user.id, code.toLowerCase());
  const project = byCode ?? byId;

  if (!project) {
    throw new ApiError(
      404,
      "PROJECT_CODE_INVALID",
      "项目不存在或邀请码无效",
    );
  }

  addProjectMember(project.id, user.id, Date.now());
  return getProjectDtoOrThrow(user.id, project.id);
}
