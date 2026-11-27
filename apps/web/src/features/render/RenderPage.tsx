import { useEffect, useLayoutEffect, useState } from "react";

import type { CanvasLink, CanvasPage } from "../projects/canvasDocument";
import {
  getCanvasLayout,
  isControlInternalPage,
} from "../projects/canvasDocument";
import { CanvasNodeView } from "../projects/CanvasNodeView";
import styles from "./RenderPage.module.css";

// Must match CANVAS_CAPTURE_PADDING in the server screenshot geometry helper.
const CANVAS_PADDING = 48;
const MAX_NODE_DEPTH = 16;

type RenderMode = "page" | "node" | "canvas";

interface RenderBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface RenderPayload {
  pages: CanvasPage[];
  links: CanvasLink[];
  updatedAt: number;
  mode: RenderMode;
  pageId: string | null;
  width: number;
  height: number;
  background: string;
  bounds?: RenderBounds;
}

interface SceneRoot {
  page: CanvasPage;
  left: number;
  top: number;
}

interface RenderScene {
  width: number;
  height: number;
  background: string;
  mode: RenderMode;
  pages: CanvasPage[];
  links: CanvasLink[];
  roots: SceneRoot[];
}

type RenderState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; scene: RenderScene };

function assertPayload(payload: RenderPayload) {
  if (!Array.isArray(payload.pages) || !Array.isArray(payload.links)) {
    throw new Error("渲染数据格式无效");
  }
  if (
    !Number.isFinite(payload.width) ||
    !Number.isFinite(payload.height) ||
    payload.width < 1 ||
    payload.height < 1
  ) {
    throw new Error("渲染尺寸无效");
  }
}

function buildScene(payload: RenderPayload): RenderScene {
  assertPayload(payload);
  const background = payload.background || "#ffffff";
  const base = {
    width: payload.width,
    height: payload.height,
    background,
    mode: payload.mode,
    pages: payload.pages,
    links: payload.links,
  };

  if (payload.mode === "page" || payload.mode === "node") {
    const page = payload.pages.find((item) => item.id === payload.pageId);
    if (!page) throw new Error("页面不存在或已被删除");
    return {
      ...base,
      roots: [{ page, left: 0, top: 0 }],
    };
  }

  const pagesById = new Map(payload.pages.map((page) => [page.id, page]));
  const roots = payload.pages.filter(
    (page) =>
      (!page.parentId || !pagesById.has(page.parentId)) &&
      !isControlInternalPage(payload.pages, page),
  );
  if (roots.length === 0) throw new Error("画布没有可渲染的页面");

  const layout = getCanvasLayout(payload.pages, payload.links);
  const rootFrames = roots
    .map((page) => layout.get(page.id) ?? null)
    .filter((frame): frame is NonNullable<typeof frame> => frame !== null);
  if (rootFrames.length === 0) throw new Error("画布没有可渲染的页面");

  const bounds =
    payload.bounds ??
    (() => {
      const minX = Math.min(...rootFrames.map((frame) => frame.worldX));
      const minY = Math.min(...rootFrames.map((frame) => frame.worldY));
      const maxX = Math.max(
        ...rootFrames.map((frame) => frame.worldX + frame.width),
      );
      const maxY = Math.max(
        ...rootFrames.map((frame) => frame.worldY + frame.height),
      );
      return {
        x: minX,
        y: minY,
        width: Math.max(1, maxX - minX),
        height: Math.max(1, maxY - minY),
      };
    })();

  return {
    ...base,
    background: payload.background || "#eef2f8",
    roots: roots.map((page) => {
      const frame = layout.get(page.id);
      return {
        page,
        left: (frame?.worldX ?? 0) - bounds.x + CANVAS_PADDING,
        top: (frame?.worldY ?? 0) - bounds.y + CANVAS_PADDING,
      };
    }),
  };
}

async function readErrorMessage(response: Response) {
  const fallback = `渲染数据请求失败 (${response.status})`;
  try {
    const body = (await response.json()) as {
      error?: { message?: unknown };
    };
    if (
      typeof body.error?.message === "string" &&
      body.error.message.trim()
    ) {
      return body.error.message;
    }
  } catch {
    // fall through to the status message
  }
  return fallback;
}

function applyDocumentBox(
  width: number,
  height: number,
  background: string,
) {
  const elements: Array<HTMLElement | null> = [
    document.documentElement,
    document.body,
    document.getElementById("root"),
  ];

  for (const element of elements) {
    if (!element) continue;
    element.style.width = `${width}px`;
    element.style.height = `${height}px`;
    element.style.minHeight = "0";
    element.style.margin = "0";
    element.style.padding = "0";
    element.style.overflow = "hidden";
    element.style.background = background;
  }
}

export function RenderPage({ token }: { token: string }) {
  const [state, setState] = useState<RenderState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    delete document.body.dataset.renderReady;
    delete document.body.dataset.renderError;
    delete document.body.dataset.renderErrorMessage;

    const load = async () => {
      try {
        const response = await fetch(
          `/api/render/${encodeURIComponent(token)}`,
          { cache: "no-store", signal: controller.signal },
        );
        if (!response.ok) {
          throw new Error(await readErrorMessage(response));
        }
        const payload = (await response.json()) as RenderPayload;
        if (cancelled) return;

        // Headless Chrome may capture before a web font finishes loading,
        // producing flaky visual baselines. Preload both weights used by the
        // canvas renderer before mounting the scene.
        if (document.fonts?.load) {
          await Promise.all([
            document.fonts.load('400 16px "Maple Mono CN"'),
            document.fonts.load('600 16px "Maple Mono CN"'),
          ]).catch(() => []);
          await document.fonts.ready;
        }
        if (cancelled) return;
        setState({ status: "ready", scene: buildScene(payload) });
      } catch (error) {
        if (cancelled) return;
        setState({
          status: "error",
          message:
            error instanceof Error && error.message
              ? error.message
              : "无法加载渲染数据",
        });
      }
    };

    void load();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [token]);

  useLayoutEffect(() => {
    if (state.status === "ready") {
      applyDocumentBox(
        state.scene.width,
        state.scene.height,
        state.scene.background,
      );
      delete document.body.dataset.renderError;
      delete document.body.dataset.renderErrorMessage;
      return;
    }
    if (state.status === "error") {
      applyDocumentBox(
        Math.max(1, window.innerWidth),
        Math.max(1, window.innerHeight),
        "#ffffff",
      );
      document.body.dataset.renderError = "true";
      document.body.dataset.renderErrorMessage = state.message;
      delete document.body.dataset.renderReady;
    }
  }, [state]);

  useEffect(() => {
    if (state.status !== "ready") return;

    let secondFrame = 0;
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        document.body.dataset.renderReady = "true";
      });
    });

    return () => {
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
      delete document.body.dataset.renderReady;
    };
  }, [state]);

  if (state.status === "loading") {
    return <div className={styles.stage} aria-busy="true" />;
  }

  if (state.status === "error") {
    return (
      <div className={styles.error}>
        <div className={styles.errorBrand}>Morfa</div>
        <div className={styles.errorTitle}>渲染失败</div>
        <p className={styles.errorMessage}>{state.message}</p>
      </div>
    );
  }

  return (
    <div
      className={styles.stage}
      data-render-mode={state.scene.mode}
      style={{
        width: state.scene.width,
        height: state.scene.height,
        background: state.scene.background,
      }}
    >
      {state.scene.roots.map((root) => (
        <CanvasNodeView
          key={root.page.id}
          page={root.page}
          pages={state.scene.pages}
          links={state.scene.links}
          root
          position={{ left: root.left, top: root.top }}
          maxDepth={MAX_NODE_DEPTH}
        />
      ))}
    </div>
  );
}
