import { useTranslation } from "react-i18next";

import { BrandMark } from "../../components/BrandMark";
import styles from "./LoadingScreen.module.css";

interface LoadingScreenProps {
  progress: number;
  taskLabelKey: string;
  status: "loading" | "error";
  error: string | null;
  onRetry: () => void;
}

export function LoadingScreen({
  progress,
  taskLabelKey,
  status,
  error,
  onRetry,
}: LoadingScreenProps) {
  const { t } = useTranslation();
  const isError = status === "error";
  const percent = isError
    ? 0
    : Math.min(100, Math.max(0, Math.round(progress * 100)));

  return (
    <main className={styles.screen} aria-busy={!isError}>
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
          <h1>
            {isError ? t("loading.errorTitle") : t("loading.title")}
          </h1>
          <p>
            {isError ? t("loading.errorHint") : t("loading.description")}
          </p>
        </div>

        {isError ? (
          <div className={styles.errorBlock}>
            {error ? <code className={styles.errorDetail}>{error}</code> : null}
            <button className={styles.retry} type="button" onClick={onRetry}>
              {t("loading.retry")}
            </button>
          </div>
        ) : (
          <div className={styles.progressBlock}>
            <div
              className={styles.track}
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
              aria-label={t("loading.title")}
            >
              <span
                className={styles.fill}
                style={{ width: `${percent}%` }}
              />
            </div>
            <div className={styles.meta}>
              <span>{t(taskLabelKey)}</span>
              <span className={styles.percent}>{percent}%</span>
            </div>
          </div>
        )}
      </section>

      <footer className={styles.footer}>Morfa · Local workspace</footer>
    </main>
  );
}
