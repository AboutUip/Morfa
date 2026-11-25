import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { BrandMark } from "../../components/BrandMark";
import { LayersIcon, SlidersIcon } from "../../components/icons";
import { type ProjectSummary } from "../../lib/api";
import { projectsStore, useProjects } from "../../lib/projects";
import { AuthModal } from "../auth/AuthModal";
import { useAuth } from "../auth/AuthProvider";
import { VCodeSetupGate } from "../auth/VCodeSetupGate";
import { ProjectLauncher } from "./ProjectLauncher";
import { ProjectTopBar, type WorkspaceTab } from "./ProjectTopBar";
import styles from "./ProjectsPage.module.css";

function ProjectCover({ project }: { project: ProjectSummary }) {
  return (
    <div className={styles.projectCover} data-type={project.type}>
      {project.iconUrl ? (
        <img src={project.iconUrl} alt="" />
      ) : (
        <BrandMark size={64} />
      )}
    </div>
  );
}

export function ProjectsPage() {
  const { t, i18n } = useTranslation();
  const { user, status } = useAuth();
  const projectState = useProjects();
  const [authOpen, setAuthOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("projects");
  const locale = i18n.resolvedLanguage === "en-US" ? "en-US" : "zh-CN";
  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeStyle: "short",
      }),
    [locale],
  );

  const projects =
    user && projectState.loadedFor === user.id
      ? projectState.projects
      : [];

  useEffect(() => {
    if (!user) return;
    void projectsStore.load(user.id).catch(() => {
      // 项目首页会展示可重试的错误状态
    });
  }, [user]);

  const openAuth = () => setAuthOpen(true);

  const renderProjects = () => {
    if (!user) {
      return (
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
          <p>{t("projects.emptyHint")}</p>
          {status === "ready" ? (
            <button
              className={styles.loginCta}
              type="button"
              onClick={openAuth}
            >
              {t("projects.loginCta")}
            </button>
          ) : null}
        </section>
      );
    }

    if (
      projectState.loadedFor !== user.id ||
      (projectState.status === "loading" && projects.length === 0)
    ) {
      return (
        <section
          id="panel-projects"
          className={styles.projectState}
          role="tabpanel"
          aria-labelledby="tab-projects"
          aria-busy="true"
        >
          <span className={styles.loadingDot} aria-hidden="true" />
          <p>{t("projects.loading")}</p>
        </section>
      );
    }

    if (projectState.status === "error" && projects.length === 0) {
      return (
        <section
          id="panel-projects"
          className={styles.projectState}
          role="tabpanel"
          aria-labelledby="tab-projects"
        >
          <h2>{t("projects.loadFailed")}</h2>
          <p>{projectState.error ?? t("projects.loadFailedHint")}</p>
          <button
            className={styles.retry}
            type="button"
            onClick={() => {
              void projectsStore.load(user.id, { force: true });
            }}
          >
            {t("projects.retry")}
          </button>
        </section>
      );
    }

    if (projects.length === 0) {
      return (
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
          <p>{t("projects.emptyHintLoggedIn")}</p>
        </section>
      );
    }

    return (
      <section
        id="panel-projects"
        className={styles.projectsSection}
        role="tabpanel"
        aria-labelledby="tab-projects"
      >
        <header className={styles.projectsHeader}>
          <p>{t("projects.projectCount", { count: projects.length })}</p>
        </header>

        <div className={styles.projectGrid}>
          {projects.map((project) => (
            <article key={project.id} className={styles.projectCard}>
              <div className={styles.projectBody}>
                <div className={styles.projectBadges}>
                  <span data-kind="type">
                    {t(`projects.types.${project.type}`)}
                  </span>
                  <span data-kind={project.visibility}>
                    {t(`projects.visibility.${project.visibility}`)}
                  </span>
                  {project.role === "member" ? (
                    <span data-kind="member">
                      {t("projects.role.member")}
                    </span>
                  ) : null}
                </div>

                <h3>{project.name}</h3>
                <p className={styles.projectDescription}>
                  {project.description}
                </p>

                <div className={styles.projectMeta}>
                  <span>
                    {project.role === "owner"
                      ? t("projects.ownerYou")
                      : t("projects.owner", {
                          name: project.ownerName,
                        })}
                  </span>
                  <span>
                    {t("projects.lastModified", {
                      date: dateFormatter.format(project.updatedAt),
                    })}
                  </span>
                </div>
              </div>

              <ProjectCover project={project} />
            </article>
          ))}
        </div>
      </section>
    );
  };

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
            renderProjects()
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

      {activeTab === "projects" && user ? <ProjectLauncher /> : null}

      {authOpen ? (
        <AuthModal initialMode="login" onClose={() => setAuthOpen(false)} />
      ) : null}

      <VCodeSetupGate />
    </div>
  );
}
