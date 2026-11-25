import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";

import { CloseIcon, SparkIcon } from "./icons";
import { apiErrorMessage } from "../lib/apiErrors";
import { lockBackground } from "../lib/backgroundLock";
import { useAnimatedClose } from "../lib/useAnimatedClose";
import type { ModelProviderModel } from "../lib/api";
import styles from "./ModelEditModal.module.css";

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

interface Capabilities {
  supportsStreaming: boolean;
  supportsThinking: boolean;
  supportsMultimodal: boolean;
}

interface ModelEditModalProps {
  providerName: string;
  model: ModelProviderModel;
  onSave: (capabilities: Capabilities) => Promise<void>;
  onClose: () => void;
}

export function ModelEditModal({
  providerName,
  model,
  onSave,
  onClose,
}: ModelEditModalProps) {
  const { t } = useTranslation();
  const { closing, beginClose } = useAnimatedClose(onClose);
  const [capabilities, setCapabilities] = useState<Capabilities>({
    supportsStreaming: model.supportsStreaming,
    supportsThinking: model.supportsThinking,
    supportsMultimodal: model.supportsMultimodal,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const panelRef = useRef<HTMLDivElement>(null);
  const firstSwitchRef = useRef<HTMLButtonElement>(null);
  const busyRef = useRef(false);

  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

  useLayoutEffect(() => {
    const releaseBackground = lockBackground();
    const trigger =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const frame = requestAnimationFrame(() =>
      firstSwitchRef.current?.focus(),
    );

    return () => {
      cancelAnimationFrame(frame);
      releaseBackground();
      if (trigger?.isConnected) {
        requestAnimationFrame(() => {
          if (trigger.isConnected) trigger.focus();
        });
      }
    };
  }, []);

  const requestClose = () => {
    if (busyRef.current) return;
    beginClose();
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        requestClose();
        return;
      }

      if (event.key !== "Tab") return;

      const panel = panelRef.current;
      if (!panel) return;

      const focusables = Array.from(
        panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter((element) => element.getClientRects().length > 0);

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

  const toggle = (key: keyof Capabilities) => {
    if (busy) return;
    setError(null);
    setCapabilities((current) => ({
      ...current,
      [key]: !current[key],
    }));
  };

  const handleSave = async () => {
    if (busy) return;

    setBusy(true);
    setError(null);

    try {
      await onSave(capabilities);
      beginClose();
    } catch (saveError) {
      setError(
        apiErrorMessage(t, saveError, "profile.models.errors.saveFailed"),
      );
    } finally {
      setBusy(false);
    }
  };

  const switchRows: Array<{
    key: keyof Capabilities;
    label: string;
    description: string;
  }> = [
    {
      key: "supportsStreaming",
      label: t("profile.models.capabilities.streaming"),
      description: t("profile.models.capabilities.streamingHint"),
    },
    {
      key: "supportsThinking",
      label: t("profile.models.capabilities.thinking"),
      description: t("profile.models.capabilities.thinkingHint"),
    },
    {
      key: "supportsMultimodal",
      label: t("profile.models.capabilities.multimodal"),
      description: t("profile.models.capabilities.multimodalHint"),
    },
  ];

  return createPortal(
    <div
      className={styles.overlay}
      data-model-edit-modal="true"
      data-closing={closing}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) event.preventDefault();
      }}
    >
      <div
        ref={panelRef}
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="model-edit-title"
        aria-describedby="model-edit-description"
        tabIndex={-1}
        inert={closing}
      >
        <div className={styles.heading}>
          <span className={styles.icon} aria-hidden="true">
            <SparkIcon size={17} />
          </span>
          <h2 id="model-edit-title">
            {t("profile.models.capabilities.title")}
          </h2>
          <p id="model-edit-description">
            {providerName} · {model.displayName ?? model.id}
          </p>
        </div>

        <div className={styles.switches}>
          {switchRows.map((row, index) => (
            <button
              key={row.key}
              ref={index === 0 ? firstSwitchRef : undefined}
              className={styles.switchRow}
              type="button"
              role="switch"
              aria-checked={capabilities[row.key]}
              onClick={() => toggle(row.key)}
              disabled={busy}
            >
              <span className={styles.switchCopy}>
                <span className={styles.switchLabel}>{row.label}</span>
                <span className={styles.switchHint}>
                  {row.description}
                </span>
              </span>
              <span
                className={styles.switchTrack}
                data-checked={capabilities[row.key]}
                aria-hidden="true"
              >
                <span className={styles.switchThumb} />
              </span>
            </button>
          ))}
        </div>

        <p className={styles.note}>
          {t("profile.models.capabilities.note")}
        </p>

        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}

        <div className={styles.actions}>
          <button
            className={styles.secondary}
            type="button"
            onClick={requestClose}
            disabled={busy}
          >
            {t("profile.models.capabilities.cancel")}
          </button>
          <button
            className={styles.primary}
            type="button"
            onClick={handleSave}
            disabled={busy}
          >
            {busy
              ? t("profile.models.capabilities.saving")
              : t("profile.models.capabilities.save")}
          </button>
        </div>

        <button
          className={styles.closeButton}
          type="button"
          onClick={requestClose}
          disabled={busy}
          aria-label={t("profile.models.capabilities.close")}
          title={t("profile.models.capabilities.close")}
        >
          <CloseIcon size={16} />
        </button>
      </div>
    </div>,
    document.body,
  );
}
