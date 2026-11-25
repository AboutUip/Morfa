import {
  ApiError,
  type CreateProjectInput,
  type ProjectSummary,
} from "./api";

export interface ProjectCreatePhase {
  ok?: boolean;
  phase?: string;
  progress?: number;
  message?: string;
  project?: ProjectSummary;
  error?: {
    code?: string;
    message?: string;
  };
}

function isPhase(value: unknown): value is ProjectCreatePhase {
  return Boolean(value) && typeof value === "object";
}

/**
 * 通过 XAIOP 流创建项目。每个 phase 都是服务端完成一步后立即发出的，
 * UI 可以在请求结束前持续更新加载页。SDK 按需加载，避免拖慢首屏。
 */
export async function createProjectStream(
  input: CreateProjectInput,
  onPhase: (phase: ProjectCreatePhase) => void,
): Promise<ProjectSummary> {
  const { XaiopStream } = await import("@bylan280/xaiop/browser");

  return new Promise<ProjectSummary>((resolve, reject) => {
    let settled = false;
    let phaseError: ApiError | null = null;

    const stream = new XaiopStream("/api/me/projects/stream", {
      mergeChunkWindow: false,
      modes: ["events"],
    });

    const finish = (project: ProjectSummary) => {
      if (settled) return;
      settled = true;
      resolve(project);
    };

    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      reject(
        error instanceof Error
          ? error
          : new ApiError(500, "PROJECT_CREATE_FAILED", "项目创建失败"),
      );
    };

    stream.on("chunk", (value: unknown) => {
      if (!isPhase(value)) return;
      onPhase(value);

      if (value.error) {
        phaseError = new ApiError(
          400,
          value.error.code ?? "PROJECT_CREATE_FAILED",
          value.error.message ?? "项目创建失败",
        );
      }
    });

    stream.on("done", (value: unknown) => {
      const phase = isPhase(value) ? value : null;
      if (phase) onPhase(phase);

      const project = phase?.project ?? null;
      if (project) {
        finish(project);
        return;
      }

      fail(
        phaseError ??
          (phase?.error
            ? new ApiError(
                400,
                phase.error.code ?? "PROJECT_CREATE_FAILED",
                phase.error.message ?? "项目创建失败",
              )
            : new ApiError(500, "PROJECT_CREATE_FAILED", "项目创建失败")),
      );
    });

    stream.on("error", (error: unknown) => {
      fail(phaseError ?? error);
    });

    try {
      stream.send({
        method: "POST",
        timeoutMs: 30_000,
        headers: {
          "content-type": "application/json",
          accept: "application/x-xaiop",
        },
        body: JSON.stringify(input),
      });
    } catch (error) {
      fail(error);
    }
  });
}
