import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { useTranslation } from "react-i18next";

import {
  CloseIcon,
  MenuIcon,
  SlidersIcon,
  SparkIcon,
  UsersIcon,
} from "../../components/icons";
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
  const toggleRef = useRef<HTMLButtonElement>(null);
  const createActionRef = useRef<HTMLButtonElement>(null);
  const joinActionRef = useRef<HTMLButtonElement>(null);
  const filterActionRef = useRef<HTMLButtonElement>(null);
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
        toggleRef.current?.focus();
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

  const openFilter = () => {
    // 预留筛选入口：默认不执行任何操作。
  };

  const focusAction = (target: "first" | "last") => {
    requestAnimationFrame(() => {
      const element =
        target === "last"
          ? filterActionRef.current
          : createActionRef.current;
      element?.focus();
    });
  };

  const handleToggleKeyDown = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
  ) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    if (!open) setOpen(true);
    focusAction(event.key === "ArrowUp" ? "last" : "first");
  };

  const handleMenuKeyDown = (
    event: ReactKeyboardEvent<HTMLDivElement>,
  ) => {
    const items = [
      createActionRef.current,
      joinActionRef.current,
      filterActionRef.current,
    ].filter((item): item is HTMLButtonElement => Boolean(item));
    if (items.length === 0) return;

    const currentIndex = items.indexOf(
      document.activeElement as HTMLButtonElement,
    );
    let nextIndex: number | null = null;

    switch (event.key) {
      case "ArrowDown":
      case "ArrowRight":
        nextIndex = (currentIndex + 1) % items.length;
        break;
      case "ArrowUp":
      case "ArrowLeft":
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
        setOpen(false);
        toggleRef.current?.focus();
        return;
      case "Tab":
        if (
          (!event.shiftKey && currentIndex === items.length - 1) ||
          (event.shiftKey && currentIndex === 0)
        ) {
          setOpen(false);
        }
        return;
      default:
        return;
    }

    event.preventDefault();
    items[nextIndex]?.focus();
  };

  if (!user || status !== "ready") return null;

  return (
    <div className={styles.root} ref={rootRef}>
      {notice ? (
        <div className={styles.notice} role="status">
          {notice}
        </div>
      ) : null}

      <div className={styles.dock}>
        <button
          ref={toggleRef}
          className={styles.toggle}
          type="button"
          aria-label={
            open
              ? t("projects.launcher.close")
              : t("projects.launcher.open")
          }
          aria-expanded={open}
          aria-haspopup="menu"
          aria-controls="project-launcher-actions"
          onClick={() => setOpen((current) => !current)}
          onKeyDown={handleToggleKeyDown}
        >
          {open ? <CloseIcon size={18} /> : <MenuIcon size={21} />}
        </button>

        <div
          id="project-launcher-actions"
          className={styles.menu}
          data-open={open}
          role="menu"
          aria-label={t("projects.launcher.open")}
          aria-hidden={!open}
          inert={!open}
          onKeyDown={handleMenuKeyDown}
        >
          <button
            ref={createActionRef}
            className={styles.action}
            type="button"
            role="menuitem"
            onClick={openCreate}
          >
            <SparkIcon size={15} />
            <span>{t("projects.launcher.create")}</span>
          </button>
          <button
            ref={joinActionRef}
            className={styles.action}
            type="button"
            role="menuitem"
            onClick={openJoin}
          >
            <UsersIcon size={15} />
            <span>{t("projects.launcher.join")}</span>
          </button>
          <button
            ref={filterActionRef}
            className={styles.action}
            type="button"
            role="menuitem"
            aria-disabled="true"
            onClick={openFilter}
          >
            <SlidersIcon size={15} />
            <span>{t("projects.launcher.filter")}</span>
          </button>
        </div>
      </div>

      {createOpen ? (
        <CreateProjectModal
          onClose={() => setCreateOpen(false)}
          onCreated={() => showNotice(t("projects.created"))}
          returnFocusRef={toggleRef}
        />
      ) : null}

      {joinOpen ? (
        <JoinProjectModal
          onClose={() => setJoinOpen(false)}
          onJoined={() => showNotice(t("projects.joined"))}
          returnFocusRef={toggleRef}
        />
      ) : null}
    </div>
  );
}
