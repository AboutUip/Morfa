import { useEffect, useRef, useState } from "react";

import { projectCanvasApi } from "../../lib/api";
import { projectsStore } from "../../lib/projects";
import type { CanvasPage } from "./canvasDocument";

const AUTOSAVE_DEBOUNCE_MS = 700;
const AUTOSAVE_RETRY_MS = 2000;

export function useProjectCanvas(projectId: string) {
  const [pages, setPages] = useState<CanvasPage[]>([]);
  const [loaded, setLoaded] = useState(false);
  const pagesRef = useRef<CanvasPage[]>([]);
  const loadedRef = useRef(false);
  const pendingRef = useRef("");
  const lastSavedRef = useRef("");
  const savingRef = useRef(false);
  const saveTimerRef = useRef<number | null>(null);
  const retryTimerRef = useRef<number | null>(null);
  const flushRef = useRef<() => void>(() => {});

  const clearSaveTimer = () => {
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
  };

  const clearRetryTimer = () => {
    if (retryTimerRef.current !== null) {
      window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  };

  const sendKeepalive = () => {
    if (!loadedRef.current) return;

    const pending = pendingRef.current;
    if (!pending || pending === lastSavedRef.current) return;

    void fetch(
      `/api/me/projects/${encodeURIComponent(projectId)}/canvas`,
      {
        method: "PUT",
        credentials: "include",
        keepalive: true,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pages: pagesRef.current }),
      },
    ).catch(() => {
      // 页面正在离开，无法再向用户展示保存错误
    });
  };

  const flush = async () => {
    if (savingRef.current || !loadedRef.current) return;
    if (!pendingRef.current || pendingRef.current === lastSavedRef.current) {
      return;
    }

    savingRef.current = true;
    try {
      while (
        loadedRef.current &&
        pendingRef.current !== lastSavedRef.current
      ) {
        const snapshot = pendingRef.current;
        if (!snapshot) break;

        const response = await projectCanvasApi.save(
          projectId,
          JSON.parse(snapshot) as CanvasPage[],
        );
        lastSavedRef.current = snapshot;
        projectsStore.touch(projectId, response.updatedAt);
      }
    } catch {
      if (loadedRef.current) {
        clearRetryTimer();
        retryTimerRef.current = window.setTimeout(() => {
          retryTimerRef.current = null;
          flushRef.current();
        }, AUTOSAVE_RETRY_MS);
      }
    } finally {
      savingRef.current = false;
    }
  };

  flushRef.current = () => {
    void flush();
  };

  useEffect(() => {
    let cancelled = false;

    setLoaded(false);
    loadedRef.current = false;
    setPages([]);
    pagesRef.current = [];
    pendingRef.current = "";
    lastSavedRef.current = "";
    clearSaveTimer();
    clearRetryTimer();

    void projectCanvasApi
      .get(projectId)
      .then((response) => {
        if (cancelled) return;

        const nextPages = response.pages;
        const serialized = JSON.stringify(nextPages);
        pagesRef.current = nextPages;
        pendingRef.current = serialized;
        lastSavedRef.current = serialized;
        setPages(nextPages);
        loadedRef.current = true;
        setLoaded(true);
      })
      .catch(() => {
        if (cancelled) return;
        loadedRef.current = false;
        setLoaded(false);
      });

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  useEffect(() => {
    pagesRef.current = pages;
    if (!loaded) return;

    const serialized = JSON.stringify(pages);
    pendingRef.current = serialized;
    if (serialized === lastSavedRef.current) return;

    clearSaveTimer();
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      flushRef.current();
    }, AUTOSAVE_DEBOUNCE_MS);
  }, [pages, loaded]);

  useEffect(() => {
    const handlePageHide = () => sendKeepalive();
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") sendKeepalive();
    };

    window.addEventListener("pagehide", handlePageHide);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      sendKeepalive();
      window.removeEventListener("pagehide", handlePageHide);
      document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange,
      );
      clearSaveTimer();
      clearRetryTimer();
      loadedRef.current = false;
    };
  }, [projectId]);

  return { pages, setPages, loaded };
}
