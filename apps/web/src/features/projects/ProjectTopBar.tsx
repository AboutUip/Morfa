import {
  Fragment,
  useEffect,
  useRef,
  useState,
  type FocusEvent as ReactFocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { useTranslation } from "react-i18next";

import { BrandMark } from "../../components/BrandMark";
import {
  CheckIcon,
  ChevronDownIcon,
  GlobeIcon,
  MoonIcon,
  SunIcon,
} from "../../components/icons";
import { setLocale, type Locale } from "../../lib/i18n";
import { useTheme } from "../../lib/theme";
import { useAuth } from "../auth/AuthProvider";
import { ProfilePanel } from "../profile/ProfilePanel";
import styles from "./ProjectTopBar.module.css";

const LANGUAGE_LABELS: Record<Locale, string> = {
  "zh-CN": "中文",
  "en-US": "English",
};

export type WorkspaceTab = "projects" | "components" | "settings";

const TABS: Array<{ id: WorkspaceTab; labelKey: string }> = [
  { id: "projects", labelKey: "nav.projects" },
  { id: "components", labelKey: "nav.components" },
  { id: "settings", labelKey: "nav.settings" },
];

interface ProjectTopBarProps {
  activeTab: WorkspaceTab;
  onTabChange: (tab: WorkspaceTab) => void;
  onLogin: () => void;
}

export function ProjectTopBar({
  activeTab,
  onTabChange,
  onLogin,
}: ProjectTopBarProps) {
  const { t, i18n } = useTranslation();
  const { resolved, toggle } = useTheme();
  const { user, status } = useAuth();
  const [languageOpen, setLanguageOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  const languageAreaRef = useRef<HTMLDivElement>(null);
  const languageButtonRef = useRef<HTMLButtonElement>(null);
  const languageMenuRef = useRef<HTMLDivElement>(null);
  const languageFocusTargetRef = useRef<"first" | "last">("first");
  const profileAreaRef = useRef<HTMLDivElement>(null);
  const profileButtonRef = useRef<HTMLButtonElement>(null);
  const tabRefs = useRef<Record<WorkspaceTab, HTMLButtonElement | null>>({
    projects: null,
    components: null,
    settings: null,
  });

  const currentLocale: Locale =
    i18n.resolvedLanguage === "en-US" ? "en-US" : "zh-CN";

  useEffect(() => {
    if (!languageOpen) return;

    const items = languageMenuRef.current?.querySelectorAll<HTMLButtonElement>(
      '[role="menuitemradio"]',
    );
    if (!items?.length) return;

    const index =
      languageFocusTargetRef.current === "last" ? items.length - 1 : 0;
    items[index]?.focus();
  }, [languageOpen]);

  useEffect(() => {
    if (!languageOpen) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!languageAreaRef.current?.contains(event.target as Node)) {
        setLanguageOpen(false);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setLanguageOpen(false);
        languageButtonRef.current?.focus();
      }
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [languageOpen]);

  useEffect(() => {
    if (!profileOpen) return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Element &&
        (target.closest('[data-vcode-modal="true"]') ||
          target.closest("#profile-panel") ||
          target.closest("[data-profile-backdrop]"))
      ) {
        return;
      }

      if (!profileAreaRef.current?.contains(event.target as Node)) {
        setProfileOpen(false);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (document.querySelector('[data-vcode-modal="true"]')) return;
        event.preventDefault();
        setProfileOpen(false);
        profileButtonRef.current?.focus();
      }
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [profileOpen]);

  useEffect(() => {
    if (!user) setProfileOpen(false);
  }, [user]);

  const openLanguageMenu = (target: "first" | "last") => {
    languageFocusTargetRef.current = target;
    if (languageOpen) {
      const items =
        languageMenuRef.current?.querySelectorAll<HTMLButtonElement>(
          '[role="menuitemradio"]',
        );
      if (items?.length) {
        items[target === "last" ? items.length - 1 : 0]?.focus();
      }
      return;
    }
    setLanguageOpen(true);
  };

  const closeLanguageMenu = (restoreFocus = true) => {
    setLanguageOpen(false);
    if (restoreFocus) languageButtonRef.current?.focus();
  };

  const handleLanguageButtonKeyDown = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
  ) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      openLanguageMenu("first");
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      openLanguageMenu("last");
    }
  };

  const handleLanguageMenuKeyDown = (
    event: ReactKeyboardEvent<HTMLDivElement>,
  ) => {
    const items = Array.from(
      languageMenuRef.current?.querySelectorAll<HTMLButtonElement>(
        '[role="menuitemradio"]',
      ) ?? [],
    );
    if (items.length === 0) return;

    const currentIndex = items.indexOf(
      document.activeElement as HTMLButtonElement,
    );
    let nextIndex: number | null = null;

    switch (event.key) {
      case "ArrowDown":
        nextIndex = (currentIndex + 1) % items.length;
        break;
      case "ArrowUp":
        nextIndex = (currentIndex - 1 + items.length) % items.length;
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = items.length - 1;
        break;
      case "Escape":
        event.preventDefault();
        closeLanguageMenu();
        return;
      default:
        return;
    }

    event.preventDefault();
    items[nextIndex]?.focus();
  };

  const handleLanguageAreaBlur = (
    event: ReactFocusEvent<HTMLDivElement>,
  ) => {
    const nextFocus = event.relatedTarget as Node | null;
    if (!nextFocus || !event.currentTarget.contains(nextFocus)) {
      setLanguageOpen(false);
    }
  };

  const handleTabKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    const currentIndex = TABS.findIndex((tab) => tab.id === activeTab);
    let nextIndex: number | null = null;

    switch (event.key) {
      case "ArrowRight":
        nextIndex = (currentIndex + 1) % TABS.length;
        break;
      case "ArrowLeft":
        nextIndex = (currentIndex - 1 + TABS.length) % TABS.length;
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = TABS.length - 1;
        break;
      default:
        return;
    }

    event.preventDefault();
    const nextTab = TABS[nextIndex];
    if (!nextTab) return;

    if (nextTab.id !== activeTab) {
      onTabChange(nextTab.id);
    }
    requestAnimationFrame(() => tabRefs.current[nextTab.id]?.focus());
  };

  const selectLanguage = (locale: Locale) => {
    setLocale(locale);
    closeLanguageMenu();
  };

  const closeProfile = () => {
    setProfileOpen(false);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (profileButtonRef.current?.isConnected) {
          profileButtonRef.current.focus();
        } else {
          document.getElementById("workspace-main")?.focus();
        }
      });
    });
  };

  return (
    <header className={styles.topBar}>
      <div className={styles.brandGroup}>
        <BrandMark size={26} />
        <span className={styles.pipe} aria-hidden="true">
          |
        </span>
        <span className={styles.productName}>{t("app.productName")}</span>
      </div>

      <nav
        className={styles.nav}
        role="tablist"
        aria-label={t("nav.primary")}
        onKeyDown={handleTabKeyDown}
      >
        {TABS.map((tab, index) => (
          <Fragment key={tab.id}>
            {index > 0 ? (
              <span className={styles.navSeparator} aria-hidden="true">
                |
              </span>
            ) : null}
            <button
              ref={(element) => {
                tabRefs.current[tab.id] = element;
              }}
              id={`tab-${tab.id}`}
              className={styles.navTab}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-controls={`panel-${tab.id}`}
              data-active={activeTab === tab.id}
              onClick={() => onTabChange(tab.id)}
            >
              {t(tab.labelKey)}
            </button>
          </Fragment>
        ))}
      </nav>

      <div className={styles.actions}>
        <button
          className={styles.iconButton}
          type="button"
          title={t("app.toggleTheme")}
          aria-label={t("app.toggleTheme")}
          onClick={toggle}
        >
          {resolved === "dark" ? <SunIcon size={15} /> : <MoonIcon size={15} />}
        </button>

        <div
          className={styles.languageArea}
          ref={languageAreaRef}
          onBlur={handleLanguageAreaBlur}
        >
          <button
            ref={languageButtonRef}
            className={styles.languageButton}
            type="button"
            title={t("app.switchLanguage")}
            aria-label={t("app.switchLanguage")}
            aria-haspopup="menu"
            aria-expanded={languageOpen}
            aria-controls="language-menu"
            onClick={() => {
              if (languageOpen) {
                closeLanguageMenu();
              } else {
                openLanguageMenu("first");
              }
            }}
            onKeyDown={handleLanguageButtonKeyDown}
          >
            <GlobeIcon size={14} />
            <span className={styles.languageLabel}>
              {LANGUAGE_LABELS[currentLocale]}
            </span>
            <ChevronDownIcon size={10} className={styles.chevron} />
          </button>

          {languageOpen ? (
            <div
              ref={languageMenuRef}
              id="language-menu"
              className={styles.languageMenu}
              role="menu"
              aria-label={t("app.switchLanguage")}
              onKeyDown={handleLanguageMenuKeyDown}
            >
              {(Object.keys(LANGUAGE_LABELS) as Locale[]).map((locale) => (
                <button
                  key={locale}
                  className={styles.languageItem}
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

        <span className={styles.divider} aria-hidden="true" />

        {status === "loading" ? (
          <span className={styles.authSkeleton} aria-hidden="true" />
        ) : user ? (
          <div className={styles.profileArea} ref={profileAreaRef}>
            <button
              ref={profileButtonRef}
              className={styles.userButton}
              type="button"
              title={t("profile.open")}
              aria-label={t("profile.open")}
              aria-haspopup="dialog"
              aria-expanded={profileOpen}
              aria-controls="profile-panel"
              onClick={() => {
                if (profileOpen) {
                  closeProfile();
                } else {
                  setProfileOpen(true);
                }
              }}
            >
              <span className={styles.avatar}>
                <img src={user.avatarUrl} alt="" />
              </span>
              <span className={styles.nickname}>{user.nickname}</span>
            </button>

            {profileOpen ? <ProfilePanel onClose={closeProfile} /> : null}
          </div>
        ) : (
          <button className={styles.loginButton} type="button" onClick={onLogin}>
            {t("auth.loginCta")}
          </button>
        )}
      </div>
    </header>
  );
}
