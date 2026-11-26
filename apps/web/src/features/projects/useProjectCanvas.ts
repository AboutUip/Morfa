import { useEffect, useRef, useState } from "react";

import { projectCanvasApi } from "../../lib/api";
import { projectsStore } from "../../lib/projects";
import type {
  CanvasDocument,
  CanvasLink,
  CanvasPage,
} from "./canvasDocument";

const AUTOSAVE_DEBOUNCE_MS = 700;
const AUTOSAVE_RETRY_MS = 2000;

const EMPTY_DOCUMENT: CanvasDocument = { pages: [], links: [] };

export function useProjectCanvas(projectId: string) {
  const [document, setDocument] =
    useState<CanvasDocument>(EMPTY_DOCUMENT);
  const [loaded, setLoaded] = useState(false);
  const documentRef = useRef<CanvasDocument>(EMPTY_DOCUMENT);
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

    const snapshot = documentRef.current;
    void fetch(
      `/api/me/projects/${encodeURIComponent(projectId)}/canvas`,
      {
        method: "PUT",
        credentials: "include",
        keepalive: true,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          pages: snapshot.pages,
          links: snapshot.links,
        }),
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

        const parsed = JSON.parse(snapshot) as CanvasDocument;
        const response = await projectCanvasApi.save(
          projectId,
          parsed.pages,
          parsed.links,
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
    setDocument(EMPTY_DOCUMENT);
    documentRef.current = EMPTY_DOCUMENT;
    pendingRef.current = "";
    lastSavedRef.current = "";
    clearSaveTimer();
    clearRetryTimer();

    void projectCanvasApi
      .get(projectId)
      .then((response) => {
        if (cancelled) return;

        const nextDocument: CanvasDocument = {
          pages: response.pages,
          links: response.links ?? [],
        };
        const serialized = JSON.stringify(nextDocument);
        documentRef.current = nextDocument;
        pendingRef.current = serialized;
        lastSavedRef.current = serialized;
        setDocument(nextDocument);
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
    documentRef.current = document;
    if (!loaded) return;

    const serialized = JSON.stringify(document);
    pendingRef.current = serialized;
    if (serialized === lastSavedRef.current) return;

    clearSaveTimer();
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      flushRef.current();
    }, AUTOSAVE_DEBOUNCE_MS);
  }, [document, loaded]);

  useEffect(() => {
    const handlePageHide = () => sendKeepalive();
    const handleVisibilityChange = () => {
      if (window.document.visibilityState === "hidden") sendKeepalive();
    };

    window.addEventListener("pagehide", handlePageHide);
    window.document.addEventListener(
      "visibilitychange",
      handleVisibilityChange,
    );

    return () => {
      sendKeepalive();
      window.removeEventListener("pagehide", handlePageHide);
      window.document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange,
      );
      clearSaveTimer();
      clearRetryTimer();
      loadedRef.current = false;
    };
  }, [projectId]);

  return {
    pages: document.pages as CanvasPage[],
    links: document.links as CanvasLink[],
    setDocument,
    loaded,
  };
}
