import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";

import { BrandMark } from "../../components/BrandMark";
import { CloseIcon, UploadIcon } from "../../components/icons";
import { ApiError } from "../../lib/api";
import { useAuth } from "./AuthProvider";
import styles from "./AuthModal.module.css";

type AuthMode = "login" | "register";
type FieldName =
  | "loginAccount"
  | "nickname"
  | "password"
  | "confirmPassword"
  | "avatar";
type FieldErrors = Partial<Record<FieldName, string>>;

const ACCOUNT_PATTERN = /^[a-zA-Z0-9_.-]{3,32}$/;
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const AVATAR_TYPES = ["image/png", "image/jpeg", "image/webp"];
const HEIGHT_TRANSITION_MS = 320;
const HEIGHT_TRANSITION_EASING = "cubic-bezier(0.16, 1, 0.3, 1)";
const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  ).filter(
    (element) =>
      !element.hasAttribute("hidden") && element.getClientRects().length > 0,
  );
}

const SERVER_ERROR_KEYS: Record<string, string> = {
  ACCOUNT_TAKEN: "auth.errors.accountTaken",
  ACCOUNT_INVALID: "auth.errors.accountInvalid",
  NICKNAME_INVALID: "auth.errors.nicknameTooLong",
  PASSWORD_INVALID: "auth.errors.passwordTooShort",
  PASSWORD_MISMATCH: "auth.errors.passwordMismatch",
  AVATAR_REQUIRED: "auth.errors.avatarRequired",
  AVATAR_TYPE: "auth.errors.avatarType",
  AVATAR_TOO_LARGE: "auth.errors.avatarTooLarge",
  INVALID_CREDENTIALS: "auth.errors.invalidCredentials",
  INVALID_INPUT: "auth.errors.invalidInput",
  INVALID_REQUEST: "auth.errors.invalidInput",
  NETWORK_ERROR: "auth.errors.network",
};

interface AuthModalProps {
  initialMode?: AuthMode;
  onClose: () => void;
}

export function AuthModal({ initialMode = "login", onClose }: AuthModalProps) {
  const { t } = useTranslation();
  const { login, register } = useAuth();

  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [loginAccount, setLoginAccount] = useState("");
  const [nickname, setNickname] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const accountRef = useRef<HTMLInputElement>(null);
  const nicknameRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmPasswordRef = useRef<HTMLInputElement>(null);
  const avatarPickerRef = useRef<HTMLButtonElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const formErrorRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const loginTabRef = useRef<HTMLButtonElement>(null);
  const registerTabRef = useRef<HTMLButtonElement>(null);
  const heightAnimationRef = useRef<{
    from: number;
    timer: number;
  } | null>(null);

  useEffect(() => {
    const target =
      initialMode === "register" ? nicknameRef.current : accountRef.current;
    const frame = requestAnimationFrame(() => target?.focus());
    return () => cancelAnimationFrame(frame);
  }, [initialMode]);

  useEffect(() => {
    if (formError) formErrorRef.current?.focus();
  }, [formError]);

  useEffect(() => {
    const trigger =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const root = document.getElementById("root");

    if (root) root.inert = true;

    return () => {
      if (root) root.inert = false;
      if (trigger?.isConnected) {
        trigger.focus();
      } else {
        document.getElementById("workspace-main")?.focus();
      }
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (busy) return;
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab") return;

      const panel = panelRef.current;
      if (!panel) return;

      const focusables = getFocusableElements(panel);
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
  }, [busy, onClose]);

  useEffect(() => {
    if (!avatarFile) {
      setAvatarPreview(null);
      return;
    }

    const url = URL.createObjectURL(avatarFile);
    setAvatarPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [avatarFile]);

  useEffect(() => {
    return () => {
      if (heightAnimationRef.current) {
        window.clearTimeout(heightAnimationRef.current.timer);
      }
    };
  }, []);

  useLayoutEffect(() => {
    const panel = panelRef.current;
    const animation = heightAnimationRef.current;

    if (!panel || !animation) return;

    panel.scrollTop = 0;
    panel.style.transition = "none";
    panel.style.height = "auto";

    const targetHeight = panel.getBoundingClientRect().height;
    panel.style.height = `${animation.from}px`;

    // Force a layout flush before starting the height transition.
    void panel.offsetHeight;

    panel.style.transition = `height ${HEIGHT_TRANSITION_MS}ms ${HEIGHT_TRANSITION_EASING}`;
    panel.style.height = `${targetHeight}px`;

    animation.timer = window.setTimeout(() => {
      panel.style.height = "";
      panel.style.transition = "";
      panel.style.overflow = "";
      heightAnimationRef.current = null;
    }, HEIGHT_TRANSITION_MS + 20);
  }, [mode]);

  const clearFieldError = (field: FieldName) => {
    setFieldErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  const handleAuthTabKeyDown = (
    event: ReactKeyboardEvent<HTMLDivElement>,
  ) => {
    if (busy) return;

    let nextMode: AuthMode | null = null;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      nextMode = mode === "login" ? "register" : "login";
    } else if (event.key === "Home") {
      nextMode = "login";
    } else if (event.key === "End") {
      nextMode = "register";
    }

    if (!nextMode) return;
    event.preventDefault();

    switchMode(nextMode);
    requestAnimationFrame(() => {
      if (nextMode === "login") {
        loginTabRef.current?.focus();
      } else {
        registerTabRef.current?.focus();
      }
    });
  };

  const switchMode = (nextMode: AuthMode) => {
    if (busy || nextMode === mode) return;

    const panel = panelRef.current;
    if (panel && !prefersReducedMotion()) {
      if (heightAnimationRef.current) {
        window.clearTimeout(heightAnimationRef.current.timer);
      }

      // FLIP：先冻结当前高度，渲染新内容后在 layout effect 中量测并过渡。
      panel.style.transition = "none";
      panel.style.overflow = "hidden";
      panel.style.height = `${panel.getBoundingClientRect().height}px`;
      heightAnimationRef.current = {
        from: panel.getBoundingClientRect().height,
        timer: 0,
      };
    }

    setMode(nextMode);
    setFieldErrors({});
    setFormError(null);
  };

  const handleAvatarChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";

    if (!file) return;

    if (!AVATAR_TYPES.includes(file.type)) {
      setAvatarFile(null);
      setFieldErrors((current) => ({
        ...current,
        avatar: "auth.errors.avatarType",
      }));
      return;
    }

    if (file.size > MAX_AVATAR_BYTES) {
      setAvatarFile(null);
      setFieldErrors((current) => ({
        ...current,
        avatar: "auth.errors.avatarTooLarge",
      }));
      return;
    }

    clearFieldError("avatar");
    setAvatarFile(file);
  };

  const focusField = (field: FieldName) => {
    switch (field) {
      case "avatar":
        avatarPickerRef.current?.focus();
        break;
      case "nickname":
        nicknameRef.current?.focus();
        break;
      case "loginAccount":
        accountRef.current?.focus();
        break;
      case "password":
        passwordRef.current?.focus();
        break;
      case "confirmPassword":
        confirmPasswordRef.current?.focus();
        break;
    }
  };

  const validate = (): FieldErrors => {
    const errors: FieldErrors = {};
    const account = loginAccount.trim();

    if (!account) {
      errors.loginAccount = "auth.errors.accountRequired";
    } else if (!ACCOUNT_PATTERN.test(account)) {
      errors.loginAccount = "auth.errors.accountInvalid";
    }

    if (!password) {
      errors.password = "auth.errors.passwordRequired";
    } else if (mode === "register" && password.length < 8) {
      errors.password = "auth.errors.passwordTooShort";
    }

    if (mode === "register") {
      const name = nickname.trim();
      if (!name) {
        errors.nickname = "auth.errors.nicknameRequired";
      } else if (name.length > 32) {
        errors.nickname = "auth.errors.nicknameTooLong";
      }

      if (!avatarFile) {
        errors.avatar = "auth.errors.avatarRequired";
      }

      if (!confirmPassword) {
        errors.confirmPassword = "auth.errors.passwordRequired";
      } else if (password !== confirmPassword) {
        errors.confirmPassword = "auth.errors.passwordMismatch";
      }
    }

    return errors;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;

    const errors = validate();
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setFormError(null);

      const firstError = (
        [
          "avatar",
          "nickname",
          "loginAccount",
          "password",
          "confirmPassword",
        ] as FieldName[]
      ).find((field) => errors[field]);

      if (firstError) {
        requestAnimationFrame(() => focusField(firstError));
      }
      return;
    }

    setBusy(true);
    setFieldErrors({});
    setFormError(null);

    try {
      if (mode === "login") {
        await login(loginAccount.trim(), password);
      } else {
        if (!avatarFile) return;

        const formData = new FormData();
        formData.append("avatar", avatarFile);
        formData.append("nickname", nickname.trim());
        formData.append("loginAccount", loginAccount.trim());
        formData.append("password", password);
        formData.append("confirmPassword", confirmPassword);
        await register(formData);
      }

      onClose();
    } catch (error) {
      if (error instanceof ApiError) {
        setFormError(SERVER_ERROR_KEYS[error.code] ?? error.message);
      } else {
        setFormError("auth.errors.unknown");
      }
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div className={styles.overlay}>
      <section
        ref={panelRef}
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-title"
        aria-describedby="auth-description"
        tabIndex={-1}
      >
        <header className={styles.header}>
          <div className={styles.brand}>
            <BrandMark size={26} />
            <span className={styles.pipe} aria-hidden="true">
              |
            </span>
            <span>{t("app.productName")}</span>
          </div>
          <button
            className={styles.closeButton}
            type="button"
            aria-label={t("auth.close")}
            title={t("auth.close")}
            onClick={onClose}
            disabled={busy}
          >
            <CloseIcon size={16} />
          </button>
        </header>

        <div
          className={styles.tabs}
          role="tablist"
          aria-label={t("auth.loginCta")}
          onKeyDown={handleAuthTabKeyDown}
        >
          <button
            ref={loginTabRef}
            id="auth-tab-login"
            className={styles.tab}
            type="button"
            role="tab"
            aria-selected={mode === "login"}
            aria-controls="auth-panel"
            data-active={mode === "login"}
            onClick={() => switchMode("login")}
            disabled={busy}
          >
            {t("auth.login")}
          </button>
          <button
            ref={registerTabRef}
            id="auth-tab-register"
            className={styles.tab}
            type="button"
            role="tab"
            aria-selected={mode === "register"}
            aria-controls="auth-panel"
            data-active={mode === "register"}
            onClick={() => switchMode("register")}
            disabled={busy}
          >
            {t("auth.register")}
          </button>
        </div>

        <div
          id="auth-panel"
          role="tabpanel"
          aria-labelledby={`auth-tab-${mode}`}
        >
          <div className={styles.titleBlock}>
            <h2 id="auth-title">
              {mode === "login"
                ? t("auth.loginTitle")
                : t("auth.registerTitle")}
            </h2>
            <p id="auth-description">
              {mode === "login"
                ? t("auth.loginSubtitle")
                : t("auth.registerSubtitle")}
            </p>
          </div>

          <form
            className={styles.form}
            onSubmit={handleSubmit}
            noValidate
            aria-busy={busy}
          >
          {mode === "register" ? (
            <div className={styles.avatarRow}>
              <button
                ref={avatarPickerRef}
                className={styles.avatarPicker}
                type="button"
                onClick={() => avatarInputRef.current?.click()}
                aria-label={t("auth.chooseAvatar")}
                disabled={busy}
              >
                {avatarPreview ? (
                  <img src={avatarPreview} alt="" />
                ) : (
                  <UploadIcon size={19} />
                )}
              </button>
              <input
                ref={avatarInputRef}
                className={styles.fileInput}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={handleAvatarChange}
                tabIndex={-1}
              />
              <div className={styles.avatarCopy}>
                <span className={styles.avatarLabel}>{t("auth.avatar")}</span>
                <span className={styles.avatarHint}>{t("auth.avatarHint")}</span>
                {fieldErrors.avatar ? (
                  <span className={styles.fieldError} role="alert">
                    {t(fieldErrors.avatar)}
                  </span>
                ) : null}
              </div>
            </div>
          ) : null}

          {mode === "register" ? (
            <label className={styles.field}>
              <span className={styles.label}>{t("auth.nickname")}</span>
              <input
                ref={nicknameRef}
                className={styles.input}
                type="text"
                value={nickname}
                onChange={(event) => {
                  setNickname(event.target.value);
                  clearFieldError("nickname");
                }}
                placeholder={t("auth.nicknamePlaceholder")}
                autoComplete="nickname"
                maxLength={32}
                disabled={busy}
                aria-invalid={Boolean(fieldErrors.nickname)}
              />
              {fieldErrors.nickname ? (
                <span className={styles.fieldError} role="alert">
                  {t(fieldErrors.nickname)}
                </span>
              ) : null}
            </label>
          ) : null}

          <label className={styles.field}>
            <span className={styles.label}>{t("auth.loginAccount")}</span>
            <input
              ref={accountRef}
              className={styles.input}
              type="text"
              value={loginAccount}
              onChange={(event) => {
                setLoginAccount(event.target.value);
                clearFieldError("loginAccount");
              }}
              placeholder={t("auth.accountPlaceholder")}
              autoComplete="username"
              autoCapitalize="none"
              maxLength={32}
              spellCheck={false}
              disabled={busy}
              aria-invalid={Boolean(fieldErrors.loginAccount)}
            />
            {fieldErrors.loginAccount ? (
              <span className={styles.fieldError} role="alert">
                {t(fieldErrors.loginAccount)}
              </span>
            ) : null}
          </label>

          <label className={styles.field}>
            <span className={styles.label}>{t("auth.password")}</span>
            <input
              ref={passwordRef}
              className={styles.input}
              type="password"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                clearFieldError("password");
              }}
              placeholder={t("auth.passwordPlaceholder")}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              maxLength={128}
              disabled={busy}
              aria-invalid={Boolean(fieldErrors.password)}
            />
            {fieldErrors.password ? (
              <span className={styles.fieldError} role="alert">
                {t(fieldErrors.password)}
              </span>
            ) : null}
          </label>

          {mode === "register" ? (
            <label className={styles.field}>
              <span className={styles.label}>{t("auth.confirmPassword")}</span>
              <input
                ref={confirmPasswordRef}
                className={styles.input}
                type="password"
                value={confirmPassword}
                onChange={(event) => {
                  setConfirmPassword(event.target.value);
                  clearFieldError("confirmPassword");
                }}
                placeholder={t("auth.confirmPasswordPlaceholder")}
                autoComplete="new-password"
                maxLength={128}
                disabled={busy}
                aria-invalid={Boolean(fieldErrors.confirmPassword)}
              />
              {fieldErrors.confirmPassword ? (
                <span className={styles.fieldError} role="alert">
                  {t(fieldErrors.confirmPassword)}
                </span>
              ) : null}
            </label>
          ) : null}

          {formError ? (
            <div
              ref={formErrorRef}
              className={styles.formError}
              role="alert"
              tabIndex={-1}
            >
              {t(formError)}
            </div>
          ) : null}

          <button className={styles.submit} type="submit" disabled={busy}>
            {busy
              ? t("auth.submitting")
              : mode === "login"
                ? t("auth.submitLogin")
                : t("auth.submitRegister")}
          </button>

          {mode === "register" ? (
            <p className={styles.autoLoginNote}>{t("auth.autoLoginNote")}</p>
          ) : null}
          </form>
        </div>
      </section>
    </div>,
    document.body,
  );
}
