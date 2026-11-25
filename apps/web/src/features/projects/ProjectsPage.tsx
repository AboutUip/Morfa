import { useState } from "react";
import { useTranslation } from "react-i18next";

import { BrandMark } from "../../components/BrandMark";
import { LayersIcon, SlidersIcon } from "../../components/icons";
import { AuthModal } from "../auth/AuthModal";
import { useAuth } from "../auth/AuthProvider";
import { VCodeSetupGate } from "../auth/VCodeSetupGate";
import { ProjectTopBar, type WorkspaceTab } from "./ProjectTopBar";
import styles from "./ProjectsPage.module.css";

export function ProjectsPage() {
  const { t } = useTranslation();
  const { user, status } = useAuth();
  const [authOpen, setAuthOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("projects");

  const openAuth = () => setAuthOpen(true);

  return (
    <div className={styles.shell}>
      <a className={styles.skipLink} href="#workspace-main">
        {t("nav.skipToContent")}
      </a>

      <ProjectTopBar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onLogin={openAuth}
      />

      <main id="workspace-main" className={styles.page} tabIndex={-1}>
        <div className={styles.container}>
          <h1 className={styles.srOnly}>{t(`nav.${activeTab}`)}</h1>
          {activeTab === "projects" ? (
            <section
              id="panel-projects"
              className={styles.empty}
              role="tabpanel"
              aria-labelledby="tab-projects"
            >
              <div className={styles.emptyIdentity}>
                <BrandMark size={44} />
                <span className={styles.identityPipe} aria-hidden="true">
                  |
                </span>
                <span className={styles.identityName}>
                  {t("app.productName")}
                </span>
              </div>
              <h2>{t("projects.emptyTitle")}</h2>
              <p>
                {user
                  ? t("projects.emptyHintLoggedIn")
                  : t("projects.emptyHint")}
              </p>
              {status === "ready" && !user ? (
                <button
                  className={styles.loginCta}
                  type="button"
                  onClick={openAuth}
                >
                  {t("projects.loginCta")}
                </button>
              ) : null}
            </section>
          ) : activeTab === "components" ? (
            <section
              id="panel-components"
              className={styles.empty}
              role="tabpanel"
              aria-labelledby="tab-components"
            >
              <span className={styles.placeholderIcon}>
                <LayersIcon size={22} />
              </span>
              <h2>{t("components.emptyTitle")}</h2>
              <p>{t("components.emptyHint")}</p>
            </section>
          ) : (
            <section
              id="panel-settings"
              className={styles.empty}
              role="tabpanel"
              aria-labelledby="tab-settings"
            >
              <span className={styles.placeholderIcon}>
                <SlidersIcon size={22} />
              </span>
              <h2>{t("settings.emptyTitle")}</h2>
              <p>{t("settings.emptyHint")}</p>
            </section>
          )}
        </div>
      </main>

      {authOpen ? (
        <AuthModal initialMode="login" onClose={() => setAuthOpen(false)} />
      ) : null}

      <VCodeSetupGate />
    </div>
  );
}
