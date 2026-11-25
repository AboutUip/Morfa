import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { useTranslation } from "react-i18next";

import { UploadIcon } from "../../components/icons";
import { ApiError, profileApi } from "../../lib/api";
import { apiErrorMessage } from "../../lib/apiErrors";
import { useAuth } from "../auth/AuthProvider";
import styles from "./ProfilePanel.module.css";
import type { RequestVCode } from "./types";

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const AVATAR_TYPES = ["image/png", "image/jpeg", "image/webp"];

interface ProfileTabProps {
  requestVCode: RequestVCode;
}

export function ProfileTab({ requestVCode }: ProfileTabProps) {
  const { t } = useTranslation();
  const { user, applyUser } = useAuth();

  const [nickname, setNickname] = useState(user?.nickname ?? "");
  const [nicknameBusy, setNicknameBusy] = useState(false);
  const [nicknameMessage, setNicknameMessage] = useState<string | null>(null);
  const [nicknameError, setNicknameError] = useState<string | null>(null);

  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarMessage, setAvatarMessage] = useState<string | null>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const [resetTicket, setResetTicket] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [resetConfirm, setResetConfirm] = useState("");
  const [resetBusy, setResetBusy] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  useEffect(() => {
    if (!avatarPreview) return;
    return () => URL.revokeObjectURL(avatarPreview);
  }, [avatarPreview]);

  if (!user) return null;

  const handleAvatarChange = async (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";

    if (!file) return;

    setAvatarMessage(null);

    if (!AVATAR_TYPES.includes(file.type)) {
      setAvatarError(t("auth.errors.avatarType"));
      return;
    }

    if (file.size > MAX_AVATAR_BYTES) {
      setAvatarError(t("auth.errors.avatarTooLarge"));
      return;
    }

    setAvatarError(null);
    setAvatarBusy(true);
    setAvatarPreview(URL.createObjectURL(file));

    try {
      const { user: updated } = await profileApi.uploadAvatar(file);
      applyUser(updated);
      setAvatarMessage(t("profile.avatar.updated"));
    } catch (error) {
      setAvatarError(
        apiErrorMessage(t, error, "profile.errors.avatarFailed"),
      );
    } finally {
      setAvatarBusy(false);
      setAvatarPreview(null);
    }
  };

  const handleNicknameSubmit = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    if (nicknameBusy) return;

    const trimmed = nickname.trim();
    setNicknameMessage(null);

    if (!trimmed) {
      setNicknameError(t("auth.errors.nicknameRequired"));
      return;
    }

    if (trimmed.length > 32) {
      setNicknameError(t("auth.errors.nicknameTooLong"));
      return;
    }

    setNicknameError(null);
    setNicknameBusy(true);

    try {
      const { user: updated } = await profileApi.updateProfile(trimmed);
      applyUser(updated);
      setNickname(updated.nickname);
      setNicknameMessage(t("profile.nicknameUpdated"));
    } catch (error) {
      setNicknameError(
        apiErrorMessage(t, error, "profile.errors.saveFailed"),
      );
    } finally {
      setNicknameBusy(false);
    }
  };

  const handlePasswordSubmit = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    if (passwordBusy) return;

    setPasswordMessage(null);

    if (!currentPassword) {
      setPasswordError(t("profile.errors.currentPasswordRequired"));
      return;
    }

    if (newPassword.length < 8) {
      setPasswordError(t("auth.errors.passwordTooShort"));
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError(t("auth.errors.passwordMismatch"));
      return;
    }

    setPasswordError(null);
    setPasswordBusy(true);

    try {
      await profileApi.changePassword({
        currentPassword,
        newPassword,
        confirmPassword,
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordMessage(t("profile.password.updated"));
    } catch (error) {
      setPasswordError(
        apiErrorMessage(t, error, "profile.errors.saveFailed"),
      );
    } finally {
      setPasswordBusy(false);
    }
  };

  const handleForgotPassword = () => {
    requestVCode("password_reset", (ticket) => {
      setResetTicket(ticket);
      setResetError(null);
      setPasswordMessage(null);
      setPasswordError(null);
    });
  };

  const handleResetSubmit = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    if (!resetTicket || resetBusy) return;

    setResetError(null);

    if (resetPassword.length < 8) {
      setResetError(t("auth.errors.passwordTooShort"));
      return;
    }

    if (resetPassword !== resetConfirm) {
      setResetError(t("auth.errors.passwordMismatch"));
      return;
    }

    setResetError(null);
    setResetBusy(true);

    try {
      await profileApi.resetPassword({
        ticket: resetTicket,
        newPassword: resetPassword,
        confirmPassword: resetConfirm,
      });
      setResetTicket(null);
      setResetPassword("");
      setResetConfirm("");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordMessage(t("profile.password.resetDone"));
    } catch (error) {
      if (error instanceof ApiError && error.code === "TICKET_INVALID") {
        setResetTicket(null);
        setResetError(null);
        setPasswordError(t("profile.password.ticketExpired"));
      } else {
        setResetError(
          apiErrorMessage(t, error, "profile.errors.saveFailed"),
        );
      }
    } finally {
      setResetBusy(false);
    }
  };

  return (
    <>
      <div className={styles.identity}>
        <button
          className={styles.avatarButton}
          type="button"
          onClick={() => avatarInputRef.current?.click()}
          disabled={avatarBusy}
          aria-label={t("profile.avatar.change")}
          title={t("profile.avatar.change")}
          aria-busy={avatarBusy}
        >
          <img src={avatarPreview ?? user.avatarUrl} alt="" />
          <span className={styles.avatarBadge} aria-hidden="true">
            <UploadIcon size={12} />
          </span>
        </button>
        <input
          ref={avatarInputRef}
          className={styles.fileInput}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={handleAvatarChange}
          tabIndex={-1}
        />
        <div className={styles.identityText}>
          <strong>{user.nickname}</strong>
          <span>@{user.loginAccount}</span>
          <button
            className={styles.textButton}
            type="button"
            onClick={() => avatarInputRef.current?.click()}
            disabled={avatarBusy}
          >
            {avatarBusy
              ? t("profile.avatar.uploading")
              : t("profile.avatar.change")}
          </button>
        </div>
      </div>

      {avatarMessage ? (
        <p className={styles.successText} role="status">
          {avatarMessage}
        </p>
      ) : null}
      {avatarError ? (
        <p className={styles.errorText} role="alert">
          {avatarError}
        </p>
      ) : null}

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h3>{t("profile.nicknameSection")}</h3>
        </div>
        <form className={styles.form} onSubmit={handleNicknameSubmit}>
          <label className={styles.field}>
            <span className={styles.label}>{t("profile.nickname")}</span>
            <input
              className={styles.input}
              type="text"
              value={nickname}
              onChange={(event) => {
                setNickname(event.target.value);
                setNicknameError(null);
                setNicknameMessage(null);
              }}
              maxLength={32}
              autoComplete="nickname"
              disabled={nicknameBusy}
              aria-invalid={Boolean(nicknameError)}
            />
          </label>
          <div className={styles.formActions}>
            <button
              className={styles.button}
              type="submit"
              disabled={
                nicknameBusy ||
                !nickname.trim() ||
                nickname.trim() === user.nickname
              }
            >
              {nicknameBusy
                ? t("profile.nicknameSaving")
                : t("profile.nicknameSave")}
            </button>
          </div>
          {nicknameMessage ? (
            <p className={styles.successText} role="status">
              {nicknameMessage}
            </p>
          ) : null}
          {nicknameError ? (
            <p className={styles.errorText} role="alert">
              {nicknameError}
            </p>
          ) : null}
        </form>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h3>{t("profile.password.title")}</h3>
          <button
            className={styles.textButton}
            type="button"
            onClick={handleForgotPassword}
            disabled={passwordBusy || resetBusy}
          >
            {t("profile.password.forgot")}
          </button>
        </div>

        {resetTicket ? (
          <form className={styles.form} onSubmit={handleResetSubmit}>
            <p className={styles.infoText}>
              {t("profile.password.resetHint")}
            </p>
            <label className={styles.field}>
              <span className={styles.label}>
                {t("profile.password.new")}
              </span>
              <input
                className={styles.input}
                type="password"
                value={resetPassword}
                onChange={(event) => {
                  setResetPassword(event.target.value);
                  setResetError(null);
                }}
                autoComplete="new-password"
                maxLength={128}
                disabled={resetBusy}
                aria-invalid={Boolean(resetError)}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>
                {t("profile.password.confirm")}
              </span>
              <input
                className={styles.input}
                type="password"
                value={resetConfirm}
                onChange={(event) => {
                  setResetConfirm(event.target.value);
                  setResetError(null);
                }}
                autoComplete="new-password"
                maxLength={128}
                disabled={resetBusy}
                aria-invalid={Boolean(resetError)}
              />
            </label>
            <div className={styles.formActions}>
              <button
                className={styles.button}
                type="submit"
                disabled={resetBusy || !resetPassword || !resetConfirm}
              >
                {resetBusy
                  ? t("profile.password.resetting")
                  : t("profile.password.resetSubmit")}
              </button>
              <button
                className={styles.buttonSecondary}
                type="button"
                onClick={() => {
                  setResetTicket(null);
                  setResetPassword("");
                  setResetConfirm("");
                  setResetError(null);
                }}
                disabled={resetBusy}
              >
                {t("profile.password.cancelReset")}
              </button>
            </div>
            {resetError ? (
              <p className={styles.errorText} role="alert">
                {resetError}
              </p>
            ) : null}
          </form>
        ) : (
          <form className={styles.form} onSubmit={handlePasswordSubmit}>
            <label className={styles.field}>
              <span className={styles.label}>
                {t("profile.password.current")}
              </span>
              <input
                className={styles.input}
                type="password"
                value={currentPassword}
                onChange={(event) => {
                  setCurrentPassword(event.target.value);
                  setPasswordError(null);
                  setPasswordMessage(null);
                }}
                autoComplete="current-password"
                maxLength={128}
                disabled={passwordBusy}
                aria-invalid={Boolean(passwordError)}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>
                {t("profile.password.new")}
              </span>
              <input
                className={styles.input}
                type="password"
                value={newPassword}
                onChange={(event) => {
                  setNewPassword(event.target.value);
                  setPasswordError(null);
                  setPasswordMessage(null);
                }}
                autoComplete="new-password"
                maxLength={128}
                disabled={passwordBusy}
                aria-invalid={Boolean(passwordError)}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>
                {t("profile.password.confirm")}
              </span>
              <input
                className={styles.input}
                type="password"
                value={confirmPassword}
                onChange={(event) => {
                  setConfirmPassword(event.target.value);
                  setPasswordError(null);
                  setPasswordMessage(null);
                }}
                autoComplete="new-password"
                maxLength={128}
                disabled={passwordBusy}
                aria-invalid={Boolean(passwordError)}
              />
            </label>
            <div className={styles.formActions}>
              <button
                className={styles.button}
                type="submit"
                disabled={
                  passwordBusy ||
                  !currentPassword ||
                  !newPassword ||
                  !confirmPassword
                }
              >
                {passwordBusy
                  ? t("profile.password.changing")
                  : t("profile.password.change")}
              </button>
            </div>
            {passwordMessage ? (
              <p className={styles.successText} role="status">
                {passwordMessage}
              </p>
            ) : null}
            {passwordError ? (
              <p className={styles.errorText} role="alert">
                {passwordError}
              </p>
            ) : null}
          </form>
        )}
      </section>
    </>
  );
}
