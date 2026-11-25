import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";

import { VCodeModal } from "../../components/VCodeModal";
import { ModelEditModal } from "../../components/ModelEditModal";
import { ModelTestModal } from "../../components/ModelTestModal";
import { PasswordModal } from "../../components/PasswordModal";
import {
  CloseIcon,
  KeyIcon,
  LogoutIcon,
  SparkIcon,
  UserIcon,
} from "../../components/icons";
import { profileApi, type VCodePurpose, modelProviderApi } from "../../lib/api";
import { lockBackground } from "../../lib/backgroundLock";
import { useAnimatedClose } from "../../lib/useAnimatedClose";
import { useMediaQuery } from "../../lib/useMediaQuery";
import { useAuth } from "../auth/AuthProvider";
import { AccountTab } from "./AccountTab";
import { ModelTab } from "./ModelTab";
import { ProfileTab } from "./ProfileTab";
import styles from "./ProfilePanel.module.css";
import type {
  ModelEditRequest,
  ModelTestRequest,
  RequestModelEdit,
  RequestModelTest,
  RequestPassword,
  RequestVCode,
  VCodeStep,
} from "./types";

type ProfileTabId = "profile" | "account" | "models";

interface VCodeRequest {
  purpose: VCodePurpose;
  onVerified: (ticket: string) => Promise<void> | void;
}

interface PasswordRequest {
  descriptionKey: string;
  onVerified: (
    password: string,
  ) => Promise<VCodeStep | void> | VCodeStep | void;
}

const TABS: Array<{
  id: ProfileTabId;
  labelKey: string;
  icon: typeof UserIcon;
}> = [
  { id: "profile", labelKey: "profile.tabs.profile", icon: UserIcon },
  { id: "account", labelKey: "profile.tabs.account", icon: KeyIcon },
  { id: "models", labelKey: "profile.tabs.models", icon: SparkIcon },
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
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const isCompact = useMediaQuery("(max-width: 640px)");
  const [activeTab, setActiveTab] = useState<ProfileTabId>("profile");
  const [loggingOut, setLoggingOut] = useState(false);
  const [vcodeRequest, setVcodeRequest] = useState<VCodeRequest | null>(
    null,
  );
  const [passwordRequest, setPasswordRequest] =
    useState<PasswordRequest | null>(null);
  const [pendingVCodeStep, setPendingVCodeStep] =
    useState<VCodeStep | null>(null);
  const [modelEditRequest, setModelEditRequest] =
    useState<ModelEditRequest | null>(null);
  const [modelTestRequest, setModelTestRequest] =
    useState<ModelTestRequest | null>(null);
  const { closing, beginClose } = useAnimatedClose(onClose);

  const panelRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Record<ProfileTabId, HTMLButtonElement | null>>({
    profile: null,
    account: null,
    models: null,
  });

  useEffect(() => {
    tabRefs.current[activeTab]?.focus();
  }, [activeTab]);

  useLayoutEffect(() => {
    const releaseBackground = lockBackground();
    const trigger =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    return () => {
      releaseBackground();
      if (trigger?.isConnected) {
        trigger.focus();
      } else {
        document.getElementById("workspace-main")?.focus();
      }
    };
  }, []);

  const modalOpen = Boolean(
    vcodeRequest ||
      passwordRequest ||
      modelEditRequest ||
      modelTestRequest,
  );

  useEffect(() => {
    if (modalOpen) return;

    const panel = panelRef.current;
    if (!panel) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        beginClose();
        return;
      }

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
  }, [modalOpen, beginClose]);

  if (!user) return null;

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

  const requestVCode: RequestVCode = (purpose, onVerified) => {
    setVcodeRequest({ purpose, onVerified });
  };

  const requestModelEdit: RequestModelEdit = (request) => {
    setModelEditRequest(request);
  };

  const requestModelTest: RequestModelTest = (request) => {
    setModelTestRequest(request);
  };

  const handleModelCapabilitiesSave = async (
    capabilities: {
      supportsStreaming: boolean;
      supportsThinking: boolean;
      supportsMultimodal: boolean;
    },
  ) => {
    if (!modelEditRequest) return;

    const { provider } = await modelProviderApi.updateModelCapabilities(
      modelEditRequest.providerId,
      modelEditRequest.model.id,
      capabilities,
    );

    modelEditRequest.onSaved(provider);
  };

  const requestPassword: RequestPassword = (
    descriptionKey,
    onVerified,
  ) => {
    setPasswordRequest({ descriptionKey, onVerified });
  };

  const handlePasswordComplete = async (password: string) => {
    if (!passwordRequest) return;

    const next = await passwordRequest.onVerified(password);
    if (next?.kind === "vcode") {
      setPendingVCodeStep(next);
    }
  };

  const handlePasswordClose = () => {
    setPasswordRequest(null);

    if (pendingVCodeStep) {
      setVcodeRequest({
        purpose: pendingVCodeStep.purpose,
        onVerified: pendingVCodeStep.onVerified,
      });
      setPendingVCodeStep(null);
    }
  };

  const handleVCodeComplete = async (code: string) => {
    if (!vcodeRequest) return;

    const { ticket } = await profileApi.verifyVCode(
      code,
      vcodeRequest.purpose,
    );

    const request = vcodeRequest;
    await request.onVerified(ticket);
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

  return createPortal(
    <>
      <div
        className={styles.backdrop}
        data-profile-backdrop="true"
        data-closing={closing}
        onClick={beginClose}
        aria-hidden="true"
      />

      <div
        ref={panelRef}
        id="profile-panel"
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-label={t("profile.panelTitle")}
        tabIndex={-1}
        data-closing={closing}
        inert={closing || modalOpen}
      >
        <button
          className={styles.closeButton}
          type="button"
          title={t("profile.close")}
          aria-label={t("profile.close")}
          onClick={beginClose}
        >
          <CloseIcon size={16} />
        </button>

        <aside className={styles.sidebar}>
          <nav
            className={styles.tabs}
            role="tablist"
            aria-orientation={isCompact ? "horizontal" : "vertical"}
            aria-label={t("profile.panelTitle")}
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
            <ProfileTab
              requestVCode={requestVCode}
              requestPassword={requestPassword}
            />
          ) : activeTab === "account" ? (
            <AccountTab
              requestVCode={requestVCode}
              requestPassword={requestPassword}
              onClose={onClose}
            />
          ) : (
            <ModelTab
              requestVCode={requestVCode}
              onEditModel={requestModelEdit}
              onTestModel={requestModelTest}
            />
          )}
        </section>
      </div>

      {passwordRequest ? (
        <PasswordModal
          title={t("passwordModal.title")}
          description={t(passwordRequest.descriptionKey)}
          onVerify={handlePasswordComplete}
          onClose={handlePasswordClose}
        />
      ) : vcodeRequest ? (
        <VCodeModal
          mode="verify"
          title={t("vcode.verifyTitle")}
          description={t(`profile.vcode.${vcodeRequest.purpose}`)}
          closeLabel={t("vcode.close")}
          onComplete={handleVCodeComplete}
          onClose={() => setVcodeRequest(null)}
        />
      ) : modelEditRequest ? (
        <ModelEditModal
          providerName={modelEditRequest.providerName}
          model={modelEditRequest.model}
          onSave={handleModelCapabilitiesSave}
          onClose={() => setModelEditRequest(null)}
        />
      ) : modelTestRequest ? (
        <ModelTestModal
          providerId={modelTestRequest.providerId}
          providerName={modelTestRequest.providerName}
          model={modelTestRequest.model}
          onClose={() => setModelTestRequest(null)}
        />
      ) : null}
    </>,
    document.body,
  );
}
