import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { BrandMark } from "./BrandMark";
import styles from "./LoadingScreen.module.css";

export interface LoadingScreenProps {
  progress: number;
  status?: "loading" | "error";
  label?: string;
  footer?: string;
  error?: string | null;
  onRetry?: () => void;
  title?: ReactNode;
  description?: ReactNode;
  errorTitle?: ReactNode;
  errorHint?: ReactNode;
  retryLabel?: ReactNode;
  progressLabel?: string;
}

/**
 * 纯展示的加载界面。
 *
 * 可独立传入进度与下方文案；需要订阅真实进度时使用 LoadingOverlay +
 * LoadingProgressController，而不是在这里直接绑定数据源。
 */
export function LoadingScreen({
  progress,
  status = "loading",
  label,
  footer,
  error,
  onRetry,
  title,
  description,
  errorTitle,
  errorHint,
  retryLabel,
  progressLabel,
}: LoadingScreenProps) {
  const { t } = useTranslation();
  const isError = status === "error";
  const percent = isError
    ? 0
    : Math.min(100, Math.max(0, Math.round(progress * 100)));
  const heading = isError
    ? (errorTitle ?? t("loading.errorTitle"))
    : (title ?? t("loading.title"));
  const descriptionText = isError
    ? (errorHint ?? t("loading.errorHint"))
    : (description ?? t("loading.description"));
  const footerText = footer ?? t("loading.footer");
  const taskLabel = label ?? t("loading.tasks.workspace");
  const progressAriaLabel =
    progressLabel ??
    (typeof heading === "string" ? heading : t("loading.title"));

  return (
    <section
      className={styles.screen}
      aria-label={progressAriaLabel}
      aria-busy={!isError}
      data-loading-screen="true"
    >
      <span className={styles.glowA} aria-hidden="true" />
      <span className={styles.glowB} aria-hidden="true" />

      <section className={styles.card}>
        <div className={styles.brandRow}>
          <BrandMark size={64} />
          <span className={styles.pipe} aria-hidden="true">
            |
          </span>
          <span className={styles.wordmark}>Morfa</span>
        </div>

        <div className={styles.statusBlock} aria-live="polite">
          <h1>{heading}</h1>
          <p>{descriptionText}</p>
        </div>

        {isError ? (
          <div className={styles.errorBlock}>
            {error ? <code className={styles.errorDetail}>{error}</code> : null}
            {onRetry ? (
              <button
                className={styles.retry}
                type="button"
                onClick={onRetry}
              >
                {retryLabel ?? t("loading.retry")}
              </button>
            ) : null}
          </div>
        ) : (
          <div className={styles.progressBlock}>
            <div
              className={styles.track}
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
              aria-label={progressAriaLabel}
            >
              <span
                className={styles.fill}
                style={{ width: `${percent}%` }}
              />
            </div>
            <div className={styles.meta}>
              <span>{taskLabel}</span>
              <span className={styles.percent}>{percent}%</span>
            </div>
          </div>
        )}
      </section>

      {footerText ? (
        <footer className={styles.footer}>{footerText}</footer>
      ) : null}
    </section>
  );
}
