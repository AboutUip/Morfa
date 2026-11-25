import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { PlusIcon, SparkIcon, UsersIcon } from "../../components/icons";
import { useAuth } from "../auth/AuthProvider";
import { CreateProjectModal } from "./CreateProjectModal";
import { JoinProjectModal } from "./JoinProjectModal";
import styles from "./ProjectLauncher.module.css";

export function ProjectLauncher() {
  const { t } = useTranslation();
  const { user, status } = useAuth();
  const [open, setOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const noticeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    return () => {
      if (noticeTimerRef.current !== null) {
        window.clearTimeout(noticeTimerRef.current);
      }
    };
  }, []);

  const showNotice = (message: string) => {
    setNotice(message);
    if (noticeTimerRef.current !== null) {
      window.clearTimeout(noticeTimerRef.current);
    }
    noticeTimerRef.current = window.setTimeout(() => {
      noticeTimerRef.current = null;
      setNotice(null);
    }, 3200);
  };

  const openCreate = () => {
    setOpen(false);
    setCreateOpen(true);
  };

  const openJoin = () => {
    setOpen(false);
    setJoinOpen(true);
  };

  if (!user || status !== "ready") return null;

  return (
    <div className={styles.root} ref={rootRef}>
      {notice ? (
        <div className={styles.notice} role="status">
          {notice}
        </div>
      ) : null}

      <div className={styles.launcher} data-open={open}>
        <div
          className={styles.actions}
          aria-hidden={!open}
          inert={!open}
        >
          <button
            className={styles.action}
            type="button"
            onClick={openCreate}
          >
            <SparkIcon size={15} />
            <span>{t("projects.launcher.create")}</span>
          </button>
          <button
            className={styles.action}
            type="button"
            onClick={openJoin}
          >
            <UsersIcon size={15} />
            <span>{t("projects.launcher.join")}</span>
          </button>
        </div>

        <button
          className={styles.toggle}
          type="button"
          aria-label={
            open
              ? t("projects.launcher.close")
              : t("projects.launcher.open")
          }
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
        >
          <PlusIcon size={22} className={styles.plus} />
        </button>
      </div>

      {createOpen ? (
        <CreateProjectModal
          onClose={() => setCreateOpen(false)}
          onCreated={() => showNotice(t("projects.created"))}
        />
      ) : null}

      {joinOpen ? (
        <JoinProjectModal
          onClose={() => setJoinOpen(false)}
          onJoined={() => showNotice(t("projects.joined"))}
        />
      ) : null}
    </div>
  );
}
