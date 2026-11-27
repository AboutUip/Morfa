import {
  useEffect,
  useRef,
  useState,
  type FocusEvent as ReactFocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { useTranslation } from "react-i18next";

import { BrandMark } from "../../components/BrandMark";
import { VCodeModal } from "../../components/VCodeModal";
import {
  AlertIcon,
  CheckIcon,
  ChevronDownIcon,
  GlobeIcon,
  LogoutIcon,
  MoonIcon,
  SunIcon,
} from "../../components/icons";
import { profileApi, projectApi, type ProjectSummary } from "../../lib/api";
import { projectsStore } from "../../lib/projects";
import { setLocale, type Locale } from "../../lib/i18n";
import { preferencesRealtime } from "../../lib/realtime";
import { useTheme } from "../../lib/theme";
import { useAuth } from "../auth/AuthProvider";
import styles from "./ProjectWorkspaceTopBar.module.css";

const LANGUAGE_LABELS: Record<Locale, string> = {
  "zh-CN": "中文",
  "en-US": "English",
};

type WorkspaceMenu = "project" | "edit" | "language";

interface ProjectWorkspaceTopBarProps {
  project: ProjectSummary;
  onExit: () => void;
}

export function ProjectWorkspaceTopBar({
  project,
  onExit,
}: ProjectWorkspaceTopBarProps) {
  const { t, i18n } = useTranslation();
  const { resolved, toggle } = useTheme();
  const { user } = useAuth();
  const [openMenu, setOpenMenu] = useState<WorkspaceMenu | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRefs = useRef<Record<WorkspaceMenu, HTMLButtonElement | null>>({
    project: null,
    edit: null,
    language: null,
  });
  const menuRefs = useRef<Record<WorkspaceMenu, HTMLDivElement | null>>({
    project: null,
    edit: null,
    language: null,
  });
  const focusTargetRef = useRef<"first" | "last">("first");

  const currentLocale: Locale =
    i18n.resolvedLanguage === "en-US" ? "en-US" : "zh-CN";

  useEffect(() => {
    if (!openMenu) return;

    const frame = requestAnimationFrame(() => {
      const selector =
        openMenu === "language"
          ? '[role="menuitemradio"]'
          : '[role="menuitem"]:not([aria-disabled="true"])';
      const items = Array.from(
        menuRefs.current[openMenu]?.querySelectorAll<HTMLButtonElement>(
          selector,
        ) ?? [],
      );
      if (!items.length) return;

      const index =
        focusTargetRef.current === "last" ? items.length - 1 : 0;
      items[index]?.focus();
    });

    return () => cancelAnimationFrame(frame);
  }, [openMenu]);

  useEffect(() => {
    if (!openMenu) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpenMenu(null);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      const current = openMenu;
      setOpenMenu(null);
      triggerRefs.current[current]?.focus();
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [openMenu]);

  const handleRootBlur = (event: ReactFocusEvent<HTMLDivElement>) => {
    const nextFocus = event.relatedTarget as Node | null;
    if (!nextFocus || !event.currentTarget.contains(nextFocus)) {
      setOpenMenu(null);
    }
  };

  const openMenuAt = (
    menu: WorkspaceMenu,
    target: "first" | "last" = "first",
  ) => {
    focusTargetRef.current = target;
    setOpenMenu(menu);
  };

  const toggleMenu = (menu: WorkspaceMenu) => {
    if (openMenu === menu) {
      setOpenMenu(null);
      return;
    }
    openMenuAt(menu, "first");
  };

  const handleTriggerKeyDown = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    menu: WorkspaceMenu,
  ) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      openMenuAt(menu, event.key === "ArrowUp" ? "last" : "first");
      return;
    }

    if (
      (event.key === "ArrowRight" || event.key === "ArrowLeft") &&
      (menu === "project" || menu === "edit")
    ) {
      event.preventDefault();
      const next = menu === "project" ? "edit" : "project";
      triggerRefs.current[next]?.focus();
    }
  };

  const handleMenuKeyDown = (
    event: ReactKeyboardEvent<HTMLDivElement>,
    menu: WorkspaceMenu,
  ) => {
    if (event.key === "Tab") {
      window.setTimeout(() => setOpenMenu(null), 0);
      return;
    }

    const selector =
      menu === "language"
        ? '[role="menuitemradio"]'
        : '[role="menuitem"]:not([aria-disabled="true"])';
    const items = Array.from(
      menuRefs.current[menu]?.querySelectorAll<HTMLButtonElement>(selector) ??
        [],
    );
    if (!items.length) return;

    const currentIndex = items.indexOf(
      document.activeElement as HTMLButtonElement,
    );
    let nextIndex: number | null = null;

    switch (event.key) {
      case "ArrowDown":
        nextIndex =
          currentIndex < 0 ? 0 : (currentIndex + 1) % items.length;
        break;
      case "ArrowUp":
        nextIndex =
          currentIndex < 0
            ? items.length - 1
            : (currentIndex - 1 + items.length) % items.length;
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = items.length - 1;
        break;
      default:
        return;
    }

    event.preventDefault();
    items[nextIndex]?.focus();
  };

  const selectLanguage = (locale: Locale) => {
    setLocale(locale);
    if (user) {
      void preferencesRealtime.update({ locale }).catch(() => {
        // 本地语言已切换，服务端同步失败不影响当前会话
      });
    }
    setOpenMenu(null);
    requestAnimationFrame(() => triggerRefs.current.language?.focus());
  };

  const handleThemeToggle = () => {
    setOpenMenu(null);
    const next = resolved === "dark" ? "light" : "dark";
    toggle();
    if (user) {
      void preferencesRealtime.update({ themeMode: next }).catch(() => {
        // 本地主题已切换，服务端同步失败不影响当前会话
      });
    }
  };

  const handleExit = () => {
    setOpenMenu(null);
    onExit();
  };

  const deleteProject = async (code: string) => {
    const { ticket } = await profileApi.verifyVCode(code, "delete_project");
    await projectApi.remove(project.id, ticket);
    projectsStore.remove(project.id);
    onExit();
  };

  return (
    <>
    <header
      ref={rootRef}
      className={styles.topBar}
      onBlur={handleRootBlur}
    >
      <div className={styles.brand}>
        <BrandMark size={26} />
        <span className={styles.pipe} aria-hidden="true">
          |
        </span>
        <span className={styles.productName}>{t("app.productName")}</span>
      </div>

      <nav
        className={styles.menuBar}
        aria-label={t("projects.workspace.menuBar", {
          name: project.name,
        })}
      >
        <div className={styles.menuArea}>
          <button
            ref={(element) => {
              triggerRefs.current.project = element;
            }}
            className={styles.menuTrigger}
            type="button"
            aria-haspopup="menu"
            aria-expanded={openMenu === "project"}
            aria-controls="workspace-project-menu"
            onClick={() => toggleMenu("project")}
            onKeyDown={(event) => handleTriggerKeyDown(event, "project")}
          >
            <span>{t("projects.workspace.menu.project")}</span>
            <ChevronDownIcon size={10} />
          </button>

          {openMenu === "project" ? (
            <div
              ref={(element) => {
                menuRefs.current.project = element;
              }}
              id="workspace-project-menu"
              className={styles.menu}
              role="menu"
              aria-label={t("projects.workspace.menu.project")}
              onKeyDown={(event) => handleMenuKeyDown(event, "project")}
            >
              <button
                className={styles.menuItem}
                type="button"
                role="menuitem"
                onClick={handleExit}
              >
                <LogoutIcon size={14} />
                <span>{t("projects.workspace.exit")}</span>
              </button>
              {project.role === "owner" ? (
                <button
                  className={styles.menuItem}
                  type="button"
                  role="menuitem"
                  data-danger="true"
                  onClick={() => {
                    setOpenMenu(null);
                    setConfirmDelete(true);
                  }}
                >
                  <AlertIcon size={14} />
                  <span>{t("projects.workspace.deleteProject")}</span>
                </button>
              ) : null}
            </div>
          ) : null}
        </div>

        <span className={styles.menuSeparator} aria-hidden="true">
          |
        </span>

        <div className={styles.menuArea}>
          <button
            ref={(element) => {
              triggerRefs.current.edit = element;
            }}
            className={styles.menuTrigger}
            type="button"
            aria-haspopup="menu"
            aria-expanded={openMenu === "edit"}
            aria-controls="workspace-edit-menu"
            onClick={() => toggleMenu("edit")}
            onKeyDown={(event) => handleTriggerKeyDown(event, "edit")}
          >
            <span>{t("projects.workspace.menu.edit")}</span>
            <ChevronDownIcon size={10} />
          </button>

          {openMenu === "edit" ? (
            <div
              ref={(element) => {
                menuRefs.current.edit = element;
              }}
              id="workspace-edit-menu"
              className={styles.menu}
              role="menu"
              aria-label={t("projects.workspace.menu.edit")}
              onKeyDown={(event) => handleMenuKeyDown(event, "edit")}
            >
              <div
                className={styles.menuEmpty}
                role="menuitem"
                aria-disabled="true"
              >
                {t("projects.workspace.emptyMenu")}
              </div>
            </div>
          ) : null}
        </div>
      </nav>

      <div className={styles.actions}>
        <button
          className={styles.iconButton}
          type="button"
          title={t("app.toggleTheme")}
          aria-label={t("app.toggleTheme")}
          onClick={handleThemeToggle}
        >
          {resolved === "dark" ? <SunIcon size={15} /> : <MoonIcon size={15} />}
        </button>

        <div className={styles.menuArea}>
          <button
            ref={(element) => {
              triggerRefs.current.language = element;
            }}
            className={`${styles.menuTrigger} ${styles.languageButton}`}
            type="button"
            title={t("app.switchLanguage")}
            aria-label={t("app.switchLanguage")}
            aria-haspopup="menu"
            aria-expanded={openMenu === "language"}
            aria-controls="workspace-language-menu"
            onClick={() => toggleMenu("language")}
            onKeyDown={(event) => handleTriggerKeyDown(event, "language")}
          >
            <GlobeIcon size={14} />
            <span className={styles.languageLabel}>
              {LANGUAGE_LABELS[currentLocale]}
            </span>
            <ChevronDownIcon size={10} />
          </button>

          {openMenu === "language" ? (
            <div
              ref={(element) => {
                menuRefs.current.language = element;
              }}
              id="workspace-language-menu"
              className={styles.menu}
              data-align="end"
              role="menu"
              aria-label={t("app.switchLanguage")}
              onKeyDown={(event) => handleMenuKeyDown(event, "language")}
            >
              {(Object.keys(LANGUAGE_LABELS) as Locale[]).map((locale) => (
                <button
                  key={locale}
                  className={styles.menuItem}
                  type="button"
                  role="menuitemradio"
                  aria-checked={locale === currentLocale}
                  data-active={locale === currentLocale}
                  onClick={() => selectLanguage(locale)}
                >
                  <span>{LANGUAGE_LABELS[locale]}</span>
                  {locale === currentLocale ? (
                    <CheckIcon size={13} className={styles.check} />
                  ) : null}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </header>
    {confirmDelete ? (
      <VCodeModal
        mode="verify"
        title={t("vcode.verifyTitle")}
        description={t("profile.vcode.delete_project")}
        closeLabel={t("vcode.close")}
        onComplete={deleteProject}
        onClose={() => setConfirmDelete(false)}
      />
    ) : null}
    </>
  );
}
