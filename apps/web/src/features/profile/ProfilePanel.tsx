import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { useTranslation } from "react-i18next";

import {
  CloseIcon,
  KeyIcon,
  LogoutIcon,
  UserIcon,
} from "../../components/icons";
import { useAuth } from "../auth/AuthProvider";
import styles from "./ProfilePanel.module.css";

type ProfileTab = "profile" | "account";

const TABS: Array<{
  id: ProfileTab;
  labelKey: string;
  icon: typeof UserIcon;
}> = [
  { id: "profile", labelKey: "profile.tabs.profile", icon: UserIcon },
  { id: "account", labelKey: "profile.tabs.account", icon: KeyIcon },
];

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

interface ProfilePanelProps {
  onClose: () => void;
}

export function ProfilePanel({ onClose }: ProfilePanelProps) {
  const { t, i18n } = useTranslation();
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<ProfileTab>("profile");
  const [loggingOut, setLoggingOut] = useState(false);

  const panelRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Record<ProfileTab, HTMLButtonElement | null>>({
    profile: null,
    account: null,
  });

  useEffect(() => {
    tabRefs.current[activeTab]?.focus();
  }, [activeTab]);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;

      const focusables = Array.from(
        panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter(
        (element) =>
          !element.hasAttribute("hidden") &&
          element.getClientRects().length > 0,
      );

      if (focusables.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      const inside = active instanceof Node && panel.contains(active);

      if (event.shiftKey) {
        if (!inside || active === first) {
          event.preventDefault();
          last?.focus();
        }
      } else if (!inside || active === last) {
        event.preventDefault();
        first?.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  if (!user) return null;

  const locale = i18n.resolvedLanguage === "en-US" ? "en-US" : "zh-CN";
  const joinedAt = new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(user.createdAt));

  const handleTabKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    const currentIndex = TABS.findIndex((tab) => tab.id === activeTab);
    let nextIndex: number | null = null;

    switch (event.key) {
      case "ArrowDown":
      case "ArrowRight":
        nextIndex = (currentIndex + 1) % TABS.length;
        break;
      case "ArrowUp":
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

    setActiveTab(nextTab.id);
    requestAnimationFrame(() => tabRefs.current[nextTab.id]?.focus());
  };

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await logout();
      onClose();
    } catch (error) {
      console.warn("[morfa] logout failed", error);
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <>
      <div
        className={styles.backdrop}
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        ref={panelRef}
        id="profile-panel"
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-label={t("profile.title")}
        tabIndex={-1}
      >
        <button
        className={styles.closeButton}
        type="button"
        title={t("profile.close")}
        aria-label={t("profile.close")}
        onClick={onClose}
      >
        <CloseIcon size={16} />
      </button>

      <aside className={styles.sidebar}>
        <nav
          className={styles.tabs}
          role="tablist"
          aria-orientation="vertical"
          aria-label={t("profile.title")}
          onKeyDown={handleTabKeyDown}
        >
          {TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                ref={(element) => {
                  tabRefs.current[tab.id] = element;
                }}
                id={`profile-tab-${tab.id}`}
                className={styles.tab}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.id}
                aria-controls="profile-panel-content"
                data-active={activeTab === tab.id}
                onClick={() => setActiveTab(tab.id)}
              >
                <Icon size={15} />
                <span>{t(tab.labelKey)}</span>
              </button>
            );
          })}
        </nav>

        <button
          className={styles.logoutButton}
          type="button"
          onClick={handleLogout}
          disabled={loggingOut}
        >
          <LogoutIcon size={15} />
          <span>{t("profile.logout")}</span>
        </button>
      </aside>

      <section
        id="profile-panel-content"
        className={styles.content}
        role="tabpanel"
        aria-labelledby={`profile-tab-${activeTab}`}
      >
        <div className={styles.contentHeader}>
          <h2>{t(`profile.tabs.${activeTab}`)}</h2>
        </div>

        {activeTab === "profile" ? (
          <>
            <div className={styles.identity}>
              <span className={styles.avatar}>
                <img src={user.avatarUrl} alt="" />
              </span>
              <div className={styles.identityText}>
                <strong>{user.nickname}</strong>
                <span>@{user.loginAccount}</span>
              </div>
            </div>

            <dl className={styles.details}>
              <div>
                <dt>{t("profile.nickname")}</dt>
                <dd>{user.nickname}</dd>
              </div>
              <div>
                <dt>{t("profile.loginAccount")}</dt>
                <dd>{user.loginAccount}</dd>
              </div>
              <div>
                <dt>{t("profile.joined")}</dt>
                <dd>{joinedAt}</dd>
              </div>
            </dl>

            <p className={styles.hint}>{t("profile.readonlyHint")}</p>
          </>
        ) : (
          <>
            <dl className={styles.details}>
              <div>
                <dt>{t("profile.loginAccount")}</dt>
                <dd>{user.loginAccount}</dd>
              </div>
              <div>
                <dt>{t("profile.userId")}</dt>
                <dd>
                  <code>{user.id}</code>
                </dd>
              </div>
              <div>
                <dt>{t("profile.status")}</dt>
                <dd>{t("profile.active")}</dd>
              </div>
              <div>
                <dt>{t("profile.joined")}</dt>
                <dd>{joinedAt}</dd>
              </div>
            </dl>

            <p className={styles.hint}>{t("profile.accountHint")}</p>
          </>
        )}
      </section>
      </div>
    </>
  );
}
