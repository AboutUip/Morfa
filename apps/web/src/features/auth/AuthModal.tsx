import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
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
  const avatarInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const target = mode === "register" ? nicknameRef.current : accountRef.current;
    const timer = window.setTimeout(() => target?.focus(), 60);
    return () => window.clearTimeout(timer);
  }, [mode]);

  useEffect(() => {
    if (!avatarFile) {
      setAvatarPreview(null);
      return;
    }

    const url = URL.createObjectURL(avatarFile);
    setAvatarPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [avatarFile]);

  const clearFieldError = (field: FieldName) => {
    setFieldErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  const switchMode = (nextMode: AuthMode) => {
    if (busy || nextMode === mode) return;
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
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-title"
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

        <div className={styles.tabs} role="tablist" aria-label={t("auth.loginCta")}>
          <button
            className={styles.tab}
            type="button"
            role="tab"
            aria-selected={mode === "login"}
            data-active={mode === "login"}
            onClick={() => switchMode("login")}
            disabled={busy}
          >
            {t("auth.login")}
          </button>
          <button
            className={styles.tab}
            type="button"
            role="tab"
            aria-selected={mode === "register"}
            data-active={mode === "register"}
            onClick={() => switchMode("register")}
            disabled={busy}
          >
            {t("auth.register")}
          </button>
        </div>

        <div className={styles.titleBlock}>
          <h2 id="auth-title">
            {mode === "login"
              ? t("auth.loginTitle")
              : t("auth.registerTitle")}
          </h2>
          <p>
            {mode === "login"
              ? t("auth.loginSubtitle")
              : t("auth.registerSubtitle")}
          </p>
        </div>

        <form className={styles.form} onSubmit={handleSubmit} noValidate>
          {mode === "register" ? (
            <div className={styles.avatarRow}>
              <button
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
            <div className={styles.formError} role="alert">
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
      </section>
    </div>,
    document.body,
  );
}
