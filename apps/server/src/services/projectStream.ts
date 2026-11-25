import { encodeSync } from "@bylan280/xaiop/core";

import type { UserRow } from "../db/users.js";
import { ApiError } from "../lib/errors.js";
import {
  createProject,
  normalizeCreateProjectInput,
  type CreateProjectInput,
  type ProjectDto,
} from "./projects.js";

interface ProjectStreamPhase {
  ok: boolean;
  phase: string;
  progress: number;
  message: string;
  project?: ProjectDto;
  error?: { code: string; message: string };
}

function encodePhase(phase: ProjectStreamPhase): string {
  return `${encodeSync(phase, {
    dotPolicy: "none",
    finalDot: false,
  }).trimEnd()}\n.\n`;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorPhase(error: unknown): ProjectStreamPhase {
  const apiError =
    error instanceof ApiError
      ? error
      : new ApiError(500, "PROJECT_CREATE_FAILED", "项目创建失败");
  return {
    ok: false,
    phase: "error",
    progress: 100,
    message: apiError.message,
    error: { code: apiError.code, message: apiError.message },
  };
}

/**
 * 项目创建期间用 XAIOP 逐阶段输出状态，前端通过 XaiopStream 渲染进度。
 * 创建动作在服务端完成，XAIOP 只承载可增量消费的状态文档。
 */
export async function* streamProjectCreation(
  user: UserRow,
  input: CreateProjectInput,
): AsyncGenerator<string, void, unknown> {
  yield encodePhase({
    ok: true,
    phase: "validating",
    progress: 8,
    message: "正在校验项目信息",
  });
  await delay(120);

  try {
    normalizeCreateProjectInput(input);
  } catch (error) {
    yield encodePhase(errorPhase(error));
    return;
  }

  yield encodePhase({
    ok: true,
    phase: "preparing",
    progress: 28,
    message: "正在准备项目空间",
  });
  await delay(140);

  try {
    const project = await createProject(user, input);

    yield encodePhase({
      ok: true,
      phase: "building",
      progress: 72,
      message: "正在生成项目主页",
    });
    await delay(160);

    yield encodePhase({
      ok: true,
      phase: "done",
      progress: 100,
      message: "项目已创建",
      project,
    });
  } catch (error) {
    yield encodePhase(errorPhase(error));
  }
}
