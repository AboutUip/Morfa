import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";

import { apiErrorMessage } from "../lib/apiErrors";
import { BackspaceIcon, CloseIcon, LockIcon } from "./icons";
import styles from "./VCodeModal.module.css";

const VCODE_LENGTH = 6;
const KEYPAD_DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export type VCodeMode = "set" | "verify";

interface VCodeModalProps {
  mode: VCodeMode;
  title: string;
  description?: string;
  closeLabel: string;
  onComplete: (code: string) => Promise<void>;
  onClose: () => void;
  canClose?: boolean;
}

export function VCodeModal({
  mode,
  title,
  description,
  closeLabel,
  onComplete,
  onClose,
  canClose = true,
}: VCodeModalProps) {
  const { t } = useTranslation();
  const [digits, setDigits] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const firstKeyRef = useRef<HTMLButtonElement>(null);
  const submittingRef = useRef(false);
  const busyRef = useRef(false);
  const canCloseRef = useRef(canClose);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

  useEffect(() => {
    canCloseRef.current = canClose;
  }, [canClose]);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useLayoutEffect(() => {
    const root = document.getElementById("root");
    const wasInert = root?.inert ?? false;
    if (root) root.inert = true;

    const trigger =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    const frame = requestAnimationFrame(() => firstKeyRef.current?.focus());

    return () => {
      cancelAnimationFrame(frame);
      if (root) root.inert = wasInert;
      if (trigger?.isConnected) {
        requestAnimationFrame(() => {
          if (trigger.isConnected) trigger.focus();
        });
      }
    };
  }, []);

  useEffect(() => {
    if (digits.length !== VCODE_LENGTH || submittingRef.current) return;

    submittingRef.current = true;
    setBusy(true);
    setError(null);

    onComplete(digits)
      .then(() => {
        setDigits("");
      })
      .catch((submitError: unknown) => {
        setError(apiErrorMessage(t, submitError, "vcode.errors.failed"));
        setDigits("");
        requestAnimationFrame(() => firstKeyRef.current?.focus());
      })
      .finally(() => {
        submittingRef.current = false;
        setBusy(false);
      });
  }, [digits, onComplete, t]);

  const appendDigit = (digit: string) => {
    if (busyRef.current) return;
    setError(null);
    setDigits((current) =>
      current.length >= VCODE_LENGTH ? current : `${current}${digit}`,
    );
  };

  const removeDigit = () => {
    if (busyRef.current) return;
    setError(null);
    setDigits((current) => current.slice(0, -1));
  };

  const requestClose = () => {
    if (!canCloseRef.current || busyRef.current) return;
    onCloseRef.current();
  };

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        requestClose();
        return;
      }

      if (event.key === "Tab") {
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
        return;
      }

      if (busyRef.current) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      if (/^\d$/.test(event.key)) {
        event.preventDefault();
        appendDigit(event.key);
        return;
      }

      if (event.key === "Backspace" || event.key === "Delete") {
        event.preventDefault();
        removeDigit();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const keypad = (
    <div className={styles.keypad}>
      {KEYPAD_DIGITS.map((digit, index) => (
        <button
          key={digit}
          ref={index === 0 ? firstKeyRef : undefined}
          className={styles.key}
          type="button"
          onClick={() => appendDigit(digit)}
          disabled={busy}
          aria-label={digit}
        >
          {digit}
        </button>
      ))}

      <button
        className={styles.deleteKey}
        type="button"
        onClick={removeDigit}
        disabled={busy}
        aria-label={t("vcode.delete")}
      >
        <BackspaceIcon size={20} />
      </button>
    </div>
  );

  return createPortal(
    <div
      className={styles.overlay}
      data-vcode-modal="true"
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
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
      >
        <div className={styles.heading}>
          <span className={styles.lock} data-mode={mode} aria-hidden="true">
            <LockIcon size={17} />
          </span>
          <h2 id={titleId}>{title}</h2>
          {description ? <p id={descriptionId}>{description}</p> : null}
        </div>

        <div
          className={styles.dots}
          data-error={Boolean(error)}
          aria-hidden="true"
        >
          {Array.from({ length: VCODE_LENGTH }, (_, index) => (
            <span
              key={index}
              className={styles.dot}
              data-filled={index < digits.length}
            />
          ))}
        </div>

        <p className={styles.progress} aria-live="polite">
          {error
            ? error
            : busy
              ? t("vcode.submitting")
              : t("vcode.progress", { value: digits.length })}
        </p>

        {keypad}

        <button
          className={styles.closeButton}
          type="button"
          onClick={requestClose}
          disabled={busy || !canClose}
          aria-label={closeLabel}
          title={closeLabel}
        >
          <CloseIcon size={16} />
        </button>
      </div>
    </div>,
    document.body,
  );
}
