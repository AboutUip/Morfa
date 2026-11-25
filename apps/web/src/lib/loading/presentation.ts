import { useEffect, useRef, useState } from "react";

import type { LoadingProgressSnapshot } from "./progress";

/** 可复用 loading 的最短展示时间，避免快速完成时闪烁。 */
export const MIN_LOADING_VISIBLE_MS = 500;

/**
 * 将 loading 状态转换为用于展示的快照。
 *
 * - loading 出现后至少保留 500ms。
 * - 如果 loading 在 500ms 内变成 success，则继续保持 loading 到满 500ms。
 * - 如果 loading 在 500ms 内变成 error，则先保持 loading，再展示错误。
 * - 组件没有真正展示过 loading 时（初始就是终态），不会补时长。
 */
export function useLoadingPresentation(
  state: LoadingProgressSnapshot,
  minVisibleMs = MIN_LOADING_VISIBLE_MS,
): LoadingProgressSnapshot | null {
  const [display, setDisplay] = useState<LoadingProgressSnapshot | null>(
    () =>
      state.status === "loading" || state.status === "error"
        ? state
        : null,
  );
  const visibleSinceRef = useRef<number | null>(
    state.status === "loading" ? Date.now() : null,
  );
  const lastLoadingRef = useRef<LoadingProgressSnapshot | null>(
    state.status === "loading" ? state : null,
  );
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const clearTimer = () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    const remainingMs = () => {
      if (visibleSinceRef.current === null) return 0;
      return Math.max(
        0,
        minVisibleMs - (Date.now() - visibleSinceRef.current),
      );
    };

    if (state.status === "loading") {
      clearTimer();
      if (visibleSinceRef.current === null) {
        visibleSinceRef.current = Date.now();
      }
      lastLoadingRef.current = state;
      setDisplay(state);
      return;
    }

    if (state.status === "error") {
      if (visibleSinceRef.current === null) {
        setDisplay(state);
        return;
      }

      const remaining = remainingMs();
      if (remaining <= 0) {
        clearTimer();
        visibleSinceRef.current = null;
        setDisplay(state);
        return;
      }

      clearTimer();
      if (lastLoadingRef.current) {
        setDisplay({
          ...lastLoadingRef.current,
          status: "loading",
          error: null,
        });
      }
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        visibleSinceRef.current = null;
        setDisplay(state);
      }, remaining);
      return;
    }

    if (state.status === "success") {
      if (visibleSinceRef.current === null) {
        setDisplay(null);
        return;
      }

      const remaining = remainingMs();
      clearTimer();

      if (lastLoadingRef.current) {
        setDisplay({
          ...lastLoadingRef.current,
          status: "loading",
          progress: 1,
          error: null,
        });
      }

      if (remaining <= 0) {
        visibleSinceRef.current = null;
        setDisplay(null);
        return;
      }

      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        visibleSinceRef.current = null;
        setDisplay(null);
      }, remaining);
      return;
    }

    clearTimer();
    visibleSinceRef.current = null;
    lastLoadingRef.current = null;
    setDisplay(null);
  }, [state, minVisibleMs]);

  return display;
}
