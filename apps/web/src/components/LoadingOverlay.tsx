import type { ReactNode } from "react";

import {
  useLoadingPresentation,
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
 * 再挂载本组件即可复用整页加载体验。每次出现至少展示 500ms，避免快速
 * 完成时闪烁；不足 500ms 的 success / error 会延后切换。
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
  const display = useLoadingPresentation(state);

  if (!display) {
    return null;
  }

  return (
    <LoadingScreen
      progress={display.progress}
      status={display.status === "error" ? "error" : "loading"}
      label={label ?? (display.label || undefined)}
      footer={footer ?? (display.footer || undefined)}
      error={display.error}
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
