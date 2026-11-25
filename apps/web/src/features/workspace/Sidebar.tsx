import { useTranslation } from "react-i18next";

import { LayersIcon, PageIcon } from "../../components/icons";
import styles from "./Sidebar.module.css";

export function Sidebar() {
  const { t } = useTranslation();

  return (
    <aside className={styles.sidebar} aria-label={t("workspace.pages")}>
      <div className={styles.sectionHeader}>
        <span>{t("workspace.pages")}</span>
        <span className={styles.count}>{t("workspace.pageCount")}</span>
      </div>

      <div className={styles.pageList}>
        <div
          className={`${styles.pageItem} ${styles.pageItemActive}`}
          aria-current="page"
        >
          <PageIcon size={14} />
          <span>{t("workspace.page1")}</span>
        </div>
      </div>

      <div className={styles.separator} />

      <div className={styles.sectionHeader}>
        <span>{t("workspace.layers")}</span>
        <span className={styles.count}>0</span>
      </div>

      <div className={styles.layersArea}>
        <div className={styles.emptyState}>
          <span className={styles.emptyIcon}>
            <LayersIcon size={17} />
          </span>
          <p className={styles.emptyTitle}>{t("workspace.layersEmpty")}</p>
          <p className={styles.emptyHint}>{t("workspace.layersEmptyHint")}</p>
        </div>
      </div>

      <div className={styles.footer}>
        <span className={styles.footerDot} aria-hidden="true" />
        <span>{t("workspace.ready")}</span>
      </div>
    </aside>
  );
}
