import { useTranslation } from "react-i18next";

import { CursorIcon } from "../../components/icons";
import styles from "./Inspector.module.css";

export function Inspector() {
  const { t } = useTranslation();

  return (
    <aside className={styles.inspector} aria-label={t("workspace.design")}>
      <div className={styles.header}>
        <CursorIcon size={13} />
        <span>{t("workspace.design")}</span>
      </div>

      <div className={styles.emptyState}>
        <span className={styles.emptyIcon}>
          <CursorIcon size={17} />
        </span>
        <p className={styles.emptyTitle}>{t("workspace.noSelection")}</p>
        <p className={styles.emptyHint}>{t("workspace.noSelectionHint")}</p>
      </div>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{t("workspace.canvas")}</h2>
        <dl className={styles.rows}>
          <div className={styles.row}>
            <dt>{t("workspace.canvasName")}</dt>
            <dd>{t("workspace.canvasSize")}</dd>
          </div>
          <div className={styles.row}>
            <dt>{t("workspace.background")}</dt>
            <dd>
              <span className={styles.swatch} aria-hidden="true" />
              {t("workspace.default")}
            </dd>
          </div>
          <div className={styles.row}>
            <dt>{t("workspace.grid")}</dt>
            <dd>{t("workspace.gridValue")}</dd>
          </div>
        </dl>
      </section>
    </aside>
  );
}
