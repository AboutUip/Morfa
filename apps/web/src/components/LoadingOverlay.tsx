import type { ReactNode } from "react";

import {
  useLoadingProgress,
  type LoadingProgressController,
} from "../lib/loading";
import { LoadingScreen } from "./LoadingScreen";

export interface LoadingOverlayProps {
  controller: LoadingProgressController;
  onRetry?: () => void;
  label?: string;
  footer?: string;
  title?: ReactNode;
  description?: ReactNode;
  errorTitle?: ReactNode;
  errorHint?: ReactNode;
  retryLabel?: ReactNode;
  progressLabel?: string;
}

/**
 * 订阅 LoadingProgressController 的加载界面。
 *
 * 任意模块只需创建 controller，在异步任务中 start / report / finish，
 * 再挂载本组件即可复用整页加载体验。
 */
export function LoadingOverlay({
  controller,
  onRetry,
  label,
  footer,
  title,
  description,
  errorTitle,
  errorHint,
  retryLabel,
  progressLabel,
}: LoadingOverlayProps) {
  const state = useLoadingProgress(controller);

  if (state.status === "idle" || state.status === "success") {
    return null;
  }

  return (
    <LoadingScreen
      progress={state.progress}
      status={state.status === "error" ? "error" : "loading"}
      label={label ?? (state.label || undefined)}
      footer={footer ?? (state.footer || undefined)}
      error={state.error}
      onRetry={onRetry}
      title={title}
      description={description}
      errorTitle={errorTitle}
      errorHint={errorHint}
      retryLabel={retryLabel}
      progressLabel={progressLabel}
    />
  );
}
