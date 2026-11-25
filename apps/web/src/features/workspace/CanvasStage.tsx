import { useTranslation } from "react-i18next";

import { SparkIcon } from "../../components/icons";
import styles from "./CanvasStage.module.css";

export function CanvasStage() {
  const { t } = useTranslation();

  return (
    <main className={styles.canvas} aria-label={t("workspace.canvas")}>
      <div className={styles.stage}>
        <div className={styles.frameLabel}>
          <span className={styles.frameDot} aria-hidden="true" />
          <span>{t("workspace.canvasName")}</span>
        </div>

        <div className={styles.artboard}>
          <div className={styles.emptyState}>
            <span className={styles.spark}>
              <SparkIcon size={22} />
            </span>
            <h2>{t("workspace.canvasEmptyTitle")}</h2>
            <p>{t("workspace.canvasEmptyHint")}</p>
          </div>
        </div>
      </div>

      <div className={styles.zoom} title={t("workspace.zoom")}>
        100%
      </div>
    </main>
  );
}
