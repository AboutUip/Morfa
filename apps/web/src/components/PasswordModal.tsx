import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";

import { apiErrorMessage } from "../lib/apiErrors";
import { lockBackground } from "../lib/backgroundLock";
import { useAnimatedClose } from "../lib/useAnimatedClose";
import { CloseIcon, LockIcon } from "./icons";
import styles from "./PasswordModal.module.css";

const FOCUSABLE_SELECTOR = [
  "input:not([disabled])",
  "button:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

interface PasswordModalProps {
  title: string;
  description: string;
  onVerify: (password: string) => Promise<void>;
  onClose: () => void;
}

export function PasswordModal({
  title,
  description,
  onVerify,
  onClose,
}: PasswordModalProps) {
  const { t } = useTranslation();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { closing, beginClose } = useAnimatedClose(onClose);

  const titleId = useId();
  const descriptionId = useId();
  const errorId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
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

    const frame = requestAnimationFrame(() => inputRef.current?.focus());

    return () => {
      cancelAnimationFrame(frame);
      releaseBackground();
      if (trigger?.isConnected) {
        requestAnimationFrame(() => {
          if (trigger.isConnected) trigger.focus();
        });
      } else {
        document.getElementById("workspace-main")?.focus();
      }
    };
  }, []);

  const requestClose = () => {
    if (busyRef.current) return;
    beginClose();
  };

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
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

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;

    if (!password) {
      setError(t("passwordModal.required"));
      requestAnimationFrame(() => inputRef.current?.focus());
      return;
    }

    setBusy(true);
    setError(null);

    try {
      await onVerify(password);
      setPassword("");
      beginClose();
    } catch (verifyError) {
      setError(
        apiErrorMessage(t, verifyError, "passwordModal.failed"),
      );
      setPassword("");
      requestAnimationFrame(() => inputRef.current?.focus());
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div
      className={styles.overlay}
      data-password-modal="true"
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
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        inert={closing}
      >
        <div className={styles.heading}>
          <span className={styles.lock} aria-hidden="true">
            <LockIcon size={17} />
          </span>
          <h2 id={titleId}>{title}</h2>
          <p id={descriptionId}>{description}</p>
        </div>

        <form className={styles.form} onSubmit={handleSubmit} noValidate>
          <label className={styles.field}>
            <span className={styles.label}>
              {t("passwordModal.label")}
            </span>
            <input
              ref={inputRef}
              className={styles.input}
              type="password"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                setError(null);
              }}
              placeholder={t("passwordModal.placeholder")}
              autoComplete="current-password"
              maxLength={128}
              disabled={busy}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? errorId : undefined}
            />
          </label>

          {error ? (
            <p id={errorId} className={styles.error} role="alert">
              {error}
            </p>
          ) : null}

          <button className={styles.submit} type="submit" disabled={busy}>
            {busy
              ? t("passwordModal.submitting")
              : t("passwordModal.submit")}
          </button>
        </form>

        <button
          className={styles.closeButton}
          type="button"
          onClick={requestClose}
          disabled={busy}
          aria-label={t("passwordModal.close")}
          title={t("passwordModal.close")}
        >
          <CloseIcon size={16} />
        </button>
      </div>
    </div>,
    document.body,
  );
}
