import type { UserRow } from "../db/users.js";
import { ApiError } from "../lib/errors.js";

export interface RealtimeOperationContext {
  user: UserRow;
  sessionTokenHash: string;
  connectionId: string;
}

export type RealtimeOperationHandler = (
  context: RealtimeOperationContext,
  payload: unknown,
) => Promise<unknown> | unknown;

const OPERATION_NAME_PATTERN = /^[a-z][a-z0-9_.-]{0,63}$/i;

function assertName(value: string, label: string) {
  if (!OPERATION_NAME_PATTERN.test(value)) {
    throw new ApiError(
      400,
      "REALTIME_OPERATION_INVALID",
      `${label} 格式不正确`,
    );
  }
}

export class RealtimeOperationRegistry {
  private readonly operations = new Map<
    string,
    RealtimeOperationHandler
  >();

  register(
    module: string,
    action: string,
    handler: RealtimeOperationHandler,
  ) {
    assertName(module, "模块名");
    assertName(action, "操作名");
    const key = `${module}.${action}`;
    if (this.operations.has(key)) {
      throw new Error(`Duplicate realtime operation: ${key}`);
    }
    this.operations.set(key, handler);
  }

  has(module: string, action: string): boolean {
    return this.operations.has(`${module}.${action}`);
  }

  async invoke(
    module: string,
    action: string,
    context: RealtimeOperationContext,
    payload: unknown,
  ): Promise<unknown> {
    assertName(module, "模块名");
    assertName(action, "操作名");

    const handler = this.operations.get(`${module}.${action}`);
    if (!handler) {
      throw new ApiError(
        404,
        "REALTIME_OPERATION_NOT_FOUND",
        `实时操作 ${module}.${action} 不存在`,
      );
    }

    return handler(context, payload);
  }
}

export const realtimeOperations = new RealtimeOperationRegistry();
