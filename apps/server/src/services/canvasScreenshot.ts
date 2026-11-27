import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import type { CanvasResolvedFrame } from "@morfa/shared/canvas-layout";

import { ApiError } from "../lib/errors.js";
import {
  getProjectCanvas,
  type CanvasPageDto,
} from "./canvasDocuments.js";
import {
  resolveCanvasPageStyles,
  resolvePageFrames,
} from "./canvasFrames.js";

const execFileAsync = promisify(execFile);
const MAX_SCREENSHOT_SCALE = 3;
const MAX_SCREENSHOT_SIDE = 4000;
const CANVAS_PADDING = 48;
const DEFAULT_PAGE_SIZE = 800;

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH ?? "",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].filter(Boolean);

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const FRAME_MANAGED_STYLES = new Set([
  "width",
  "height",
  "min-width",
  "max-width",
  "min-height",
  "max-height",
  "left",
  "right",
  "top",
  "bottom",
]);

function cssStyle(page: CanvasPageDto) {
  const entries: string[] = [];
  for (const [key, value] of Object.entries(page.styles)) {
    if (FRAME_MANAGED_STYLES.has(key)) continue;
    if (key.startsWith("--") || value.includes("${")) continue;
    entries.push(`${key}:${value}`);
  }
  entries.push("position:relative", "box-sizing:border-box");
  return entries.join(";");
}

function widgetHtml(page: CanvasPageDto) {
  const widget = page.widget;
  if (!widget) return "";
  const text = escapeHtml(widget.text?.trim() || "");
  const value = widget.value ?? 55;

  const shell = (inner: string, extra = "") =>
    `<div style="width:100%;height:100%;box-sizing:border-box;${extra}">${inner}</div>`;

  switch (widget.kind) {
    case "button": {
      const variant = widget.variant ?? "primary";
      const primary = variant === "primary" || variant === "icon";
      const icon = variant === "icon";
      return shell(
        icon
          ? `<div style="font-size:26px;line-height:1;font-weight:400;">+</div>`
          : `<div style="max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${
              text || "Button"
            }</div>`,
        `display:flex;align-items:center;justify-content:center;gap:6px;border-radius:10px;font-family:system-ui,sans-serif;font-size:14px;font-weight:600;padding:0 14px;background:${
          primary ? "#2f6fed" : variant === "ghost" ? "transparent" : "#fff"
        };color:${
          primary
            ? "#fff"
            : variant === "ghost"
              ? "#2f6fed"
              : "#2f6fed"
        };border:${primary || variant === "ghost" ? "0" : "1.5px solid #2f6fed"};box-shadow:${
          primary ? "0 2px 8px rgba(47,111,237,.28)" : "none"
        };opacity:${widget.disabled ? 0.55 : 1};`,
      );
    }
    case "text": {
      const variant = widget.variant ?? "paragraph";
      const size = variant === "heading" ? 36 : variant === "label" ? 15 : 15;
      const weight = variant === "heading" ? 700 : variant === "label" ? 650 : 400;
      return shell(
        `<div style="width:100%;height:100%;display:flex;align-items:${variant === "paragraph" ? "flex-start" : "center"};font-family:system-ui,sans-serif;font-size:${size}px;font-weight:${weight};line-height:1.35;color:${
          variant === "paragraph" ? "#5e687a" : "#172033"
        };">${text || "Text"}</div>`,
      );
    }
    case "select":
    case "input":
    case "search":
    case "textarea": {
      const isSearch = widget.kind === "search";
      const isTextarea = widget.kind === "textarea";
      return shell(
        `<div style="display:flex;align-items:${isTextarea ? "flex-start" : "center"};width:100%;height:100%;padding:0 ${
          isSearch ? "14px" : "12px"
        };box-sizing:border-box;border:1px solid #d7dce6;border-radius:${
          isSearch ? "999px" : "8px"
        };background:#fff;color:#7b8496;font-family:system-ui,sans-serif;font-size:13px;overflow:hidden;">${
          isSearch ? "⌕ " : ""
        }<span style="overflow:hidden;text-overflow:ellipsis;white-space:${
          isTextarea ? "pre-wrap" : "nowrap"
        };">${text || (widget.kind === "select" ? "Select" : "Enter text")}</span></div>`,
      );
    }
    case "checkbox":
    case "radio": {
      const checked = widget.checked ?? true;
      const box =
        widget.kind === "checkbox"
          ? `<span style="display:flex;width:18px;height:18px;align-items:center;justify-content:center;border-radius:4px;background:${
              checked ? "#2f6fed" : "#fff"
            };border:${checked ? "0" : "1.5px solid #c8cfda"};color:#fff;font-size:13px;">${
              checked ? "✓" : ""
            }</span>`
          : `<span style="display:flex;width:18px;height:18px;align-items:center;justify-content:center;border-radius:50%;border:2px solid ${
              checked ? "#2f6fed" : "#c8cfda"
            };box-sizing:border-box;"><span style="width:8px;height:8px;border-radius:50%;background:${
              checked ? "#2f6fed" : "transparent"
            };"></span></span>`;
      return shell(
        `<div style="display:flex;align-items:center;gap:8px;font-family:system-ui,sans-serif;font-size:13px;color:#333c4e;">${box}<span>${text || "Option"}</span></div>`,
        "display:flex;align-items:center;",
      );
    }
    case "toggle": {
      const checked = widget.checked ?? true;
      return shell(
        `<div style="display:flex;align-items:center;gap:8px;font-family:system-ui,sans-serif;font-size:13px;color:#333c4e;"><span style="position:relative;width:44px;height:24px;border-radius:999px;background:${
          checked ? "#2f6fed" : "#cbd2de"
        };display:inline-block;"><span style="position:absolute;top:2px;${
          checked ? "right:2px" : "left:2px"
        };width:20px;height:20px;border-radius:50%;background:#fff;"></span></span><span>${
          text || "Toggle"
        }</span></div>`,
        "display:flex;align-items:center;",
      );
    }
    case "progress": {
      const width = Math.min(100, Math.max(0, value));
      return shell(
        `<div style="display:flex;flex-direction:column;justify-content:center;gap:5px;width:100%;height:100%;font-family:system-ui,sans-serif;"><div style="display:flex;justify-content:space-between;color:#4d5769;font-size:11px;font-weight:600;"><span>${
          text || "Progress"
        }</span>${widget.showValue === false ? "" : `<span>${width}%</span>`}</div><div style="height:8px;border-radius:999px;background:#e7ebf3;overflow:hidden;"><div style="width:${width}%;height:100%;border-radius:999px;background:linear-gradient(90deg,#6d97ff,#2f6fed);"></div></div></div>`,
      );
    }
    case "slider":
      return shell(
        `<div style="position:relative;display:flex;align-items:center;width:100%;height:100%;"><div style="width:100%;height:6px;border-radius:999px;background:#e7ebf3;overflow:hidden;"><div style="width:${Math.min(
          100,
          Math.max(0, value),
        )}%;height:100%;background:#2f6fed;"></div></div><span style="position:absolute;left:${Math.min(
          100,
          Math.max(0, value),
        )}%;top:50%;width:16px;height:16px;border-radius:50%;background:#fff;border:2px solid #2f6fed;transform:translate(-50%,-50%);box-sizing:border-box;"></span></div>`,
      );
    case "image": {
      const src = widget.src?.trim();
      return src
        ? shell(
            `<img src="${escapeHtml(src)}" style="width:100%;height:100%;object-fit:${widget.fit === "contain" ? "contain" : "cover"};display:block;">`,
            "border-radius:12px;overflow:hidden;background:#eef1f7;",
          )
        : shell(
            `<div style="display:flex;width:100%;height:100%;align-items:center;justify-content:center;border-radius:12px;background:linear-gradient(135deg,#eff3fa,#dfe7f4);color:#8b94a6;font-family:system-ui,sans-serif;font-size:14px;">${text || "Image"}</div>`,
          );
    }
    case "video":
      return shell(
        `<div style="display:flex;width:100%;height:100%;align-items:center;justify-content:center;border-radius:12px;background:linear-gradient(145deg,#2a3140,#10141b);color:#fff;"><div style="display:flex;width:54px;height:54px;align-items:center;justify-content:center;border-radius:50%;background:rgba(255,255,255,.92);color:#111;font-size:22px;">▶</div></div>`,
      );
    case "avatar":
      return `<div style="display:flex;width:100%;height:100%;align-items:center;justify-content:center;border-radius:50%;background:linear-gradient(145deg,#5d8bff,#2f6fed);color:#fff;font-family:system-ui,sans-serif;font-size:24px;font-weight:700;">${escapeHtml(
        (text || "M").slice(0, 1).toUpperCase(),
      )}</div>`;
    case "badge": {
      const colors: Record<string, [string, string]> = {
        accent: ["#e8efff", "#2f6fed"],
        success: ["#e7f8ef", "#17996a"],
        warning: ["#fff4dc", "#a66b10"],
        danger: ["#ffe9e9", "#c63c3c"],
      };
      const [bg, fg] = colors[widget.variant ?? "accent"] ?? colors.accent;
      return shell(
        `<span style="padding:0 12px;border-radius:999px;background:${bg};color:${fg};font-family:system-ui,sans-serif;font-size:12px;font-weight:650;line-height:1.8;white-space:nowrap;">${
          text || "New"
        }</span>`,
        "display:flex;align-items:center;justify-content:center;",
      );
    }
    case "card": {
      const description = widget.description?.trim();
      return shell(
        `<div style="display:flex;flex-direction:column;width:100%;height:100%;border:1px solid #dde2eb;border-radius:12px;overflow:hidden;background:#fff;font-family:system-ui,sans-serif;"><div style="flex:1.2;min-height:0;background:linear-gradient(135deg,#7ba1ff,#365fd4);display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,.8);font-size:24px;">▧</div><div style="flex:1;padding:10px 12px;display:flex;flex-direction:column;gap:6px;"><div style="font-size:13px;font-weight:650;color:#1c2434;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${
          text || "Card title"
        }</div><div style="font-size:10px;line-height:1.4;color:#7a8496;overflow:hidden;">${
          description || "Supporting description text"
        }</div></div></div>`,
      );
    }
    case "tabs": {
      const labels = (text || "Overview|Details|Settings")
        .split("|")
        .map((item) => item.trim())
        .filter(Boolean);
      const active = Math.min(
        Math.max(0, widget.activeIndex ?? 0),
        Math.max(0, labels.length - 1),
      );
      return shell(
        `<div style="display:flex;width:100%;height:100%;border-bottom:1px solid #dde2eb;background:#fff;font-family:system-ui,sans-serif;">${labels
          .map(
            (label, index) =>
              `<div style="flex:1;display:flex;align-items:center;justify-content:center;border-bottom:2px solid ${
                index === active ? "#2f6fed" : "transparent"
              };color:${index === active ? "#2f6fed" : "#7a8496"};font-size:12px;font-weight:600;">${escapeHtml(
                label,
              )}</div>`,
          )
          .join("")}</div>`,
      );
    }
    case "alert": {
      const variants: Record<string, [string, string, string]> = {
        info: ["#eef5ff", "#cbdfff", "#2c4a7a"],
        success: ["#edf9f2", "#bfe8d2", "#145c3c"],
        warning: ["#fff8e8", "#f2ddaf", "#7a5310"],
        error: ["#fff0f0", "#f0c5c5", "#8a2a2a"],
      };
      const [bg, border, color] =
        variants[widget.variant ?? "info"] ?? variants.info;
      return shell(
        `<div style="display:flex;width:100%;height:100%;align-items:center;gap:8px;padding:0 12px;border:1px solid ${border};border-radius:10px;background:${bg};color:${color};font-family:system-ui,sans-serif;font-size:12px;"><span style="font-size:14px;">ⓘ</span><span style="flex:1;overflow:hidden;">${
          text || "Heads up, this is an alert."
        }</span><span style="color:#7f93b5;">×</span></div>`,
      );
    }
    case "divider":
      return `<div style="width:100%;height:2px;background:#d9dee8;border-radius:999px;"></div>`;
    case "chart": {
      const values = (
        widget.data?.length ? widget.data : [36, 62, 46, 78, 58, 88]
      ).map((point) => Math.min(100, Math.max(0, point)));
      const max = Math.max(...values, 1);
      const bars = values
        .map(
          (point, index) =>
            `<div style="flex:1;height:${(point / max) * 100}%;border-radius:999px 999px 2px 2px;background:${
              index % 2 ? "linear-gradient(180deg,#b8ccff,#6d92f5)" : "linear-gradient(180deg,#7ba1ff,#2f6fed)"
            };"></div>`,
        )
        .join("");
      return shell(
        `<div style="display:flex;flex-direction:column;gap:8px;width:100%;height:100%;padding:12px;box-sizing:border-box;border:1px solid #dde2eb;border-radius:12px;background:#fff;font-family:system-ui,sans-serif;">${
          text
            ? `<div style="font-size:13px;font-weight:650;color:#1c2434;">${text}</div>`
            : ""
        }<div style="display:flex;flex:1;align-items:flex-end;gap:4%;min-height:0;">${bars}</div></div>`,
      );
    }
    default:
      return "";
  }
}

interface RenderContext {
  pagesById: Map<string, CanvasPageDto>;
  childrenByParent: Map<string, CanvasPageDto[]>;
  frames: Map<string, CanvasResolvedFrame>;
}

function buildRenderContext(
  pages: CanvasPageDto[],
  frames: Map<string, CanvasResolvedFrame>,
): RenderContext {
  const pagesById = new Map(pages.map((page) => [page.id, page]));
  const childrenByParent = new Map<string, CanvasPageDto[]>();

  for (const page of pages) {
    if (!page.parentId || !pagesById.has(page.parentId)) continue;
    const list = childrenByParent.get(page.parentId);
    if (list) list.push(page);
    else childrenByParent.set(page.parentId, [page]);
  }

  return { pagesById, childrenByParent, frames };
}

function nodeSize(frame: CanvasResolvedFrame | null) {
  return {
    width:
      frame && Number.isFinite(frame.width)
        ? frame.width
        : DEFAULT_PAGE_SIZE,
    height:
      frame && Number.isFinite(frame.height)
        ? frame.height
        : DEFAULT_PAGE_SIZE,
  };
}

function renderPageNode(
  page: CanvasPageDto,
  context: RenderContext,
  left: number,
  top: number,
  visited: Set<string>,
  depth = 0,
): string {
  if (depth > 16 || visited.has(page.id)) return "";
  visited.add(page.id);

  const frame = context.frames.get(page.id) ?? null;
  const size = nodeSize(frame);
  const children = context.childrenByParent.get(page.id) ?? [];
  const style = cssStyle(page);

  const childHtml = children
    .map((child) => {
      const childFrame = context.frames.get(child.id) ?? null;
      const childLeft =
        childFrame && frame
          ? childFrame.worldX - frame.worldX
          : child.x - page.x;
      const childTop =
        childFrame && frame
          ? childFrame.worldY - frame.worldY
          : child.y - page.y;
      return renderPageNode(
        child,
        context,
        childLeft,
        childTop,
        visited,
        depth + 1,
      );
    })
    .join("");

  return `<div data-node-id="${escapeHtml(page.id)}" style="${style};position:absolute;left:${left}px;top:${top}px;width:${size.width}px;height:${size.height}px;overflow:hidden;">${
    page.widget ? widgetHtml(page) : ""
  }${childHtml}</div>`;
}

function documentHtml(
  width: number,
  height: number,
  background: string,
  body: string,
) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;padding:0;width:${width}px;height:${height}px;overflow:hidden;background:${background};}
    *{box-sizing:border-box;}
  </style></head><body data-capture-ready="true">${body}</body></html>`;
}

function clampScale(scale: number) {
  return Math.min(MAX_SCREENSHOT_SCALE, Math.max(0.5, scale));
}

function assertScreenshotSize(
  width: number,
  height: number,
  label: string,
) {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width < 1 ||
    height < 1
  ) {
    throw new ApiError(
      400,
      "SCREENSHOT_INVALID_SIZE",
      `${label}尺寸无效`,
    );
  }
  if (width > MAX_SCREENSHOT_SIDE || height > MAX_SCREENSHOT_SIDE) {
    throw new ApiError(
      413,
      "SCREENSHOT_TOO_LARGE",
      `${label}尺寸超出截图限制`,
    );
  }
}

async function resolveChromePath() {
  for (const candidate of CHROME_CANDIDATES) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // try next
    }
  }
  throw new ApiError(
    503,
    "SCREENSHOT_BROWSER_MISSING",
    "截图需要 Chrome/Chromium，请设置 CHROME_PATH",
  );
}

async function captureRenderedHtml(
  html: string,
  width: number,
  height: number,
  scale: number,
) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "morfa-shot-"));
  const htmlPath = path.join(dir, "page.html");
  const pngPath = path.join(dir, "page.png");
  await fs.writeFile(htmlPath, html, "utf8");

  try {
    const chrome = await resolveChromePath();
    const args = [
      "--headless=new",
      "--disable-gpu",
      "--hide-scrollbars",
      "--no-sandbox",
      "--disable-dev-shm-usage",
      `--force-device-scale-factor=${scale}`,
      `--window-size=${Math.ceil(width)},${Math.ceil(height)}`,
      "--virtual-time-budget=800",
      `--screenshot=${pngPath}`,
      `file:///${htmlPath.replace(/\\/g, "/")}`,
    ];
    await execFileAsync(chrome, args, {
      timeout: 20_000,
      windowsHide: true,
    });
    const buffer = await fs.readFile(pngPath);
    return buffer.toString("base64");
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

async function renderNodeCapture(
  userId: string,
  projectId: string,
  nodeId: string,
  scale: number,
) {
  const document = getProjectCanvas(userId, projectId);
  const resolvedPages = resolveCanvasPageStyles(
    document.pages,
    document.links,
  );
  const node = resolvedPages.find((item) => item.id === nodeId);
  if (!node) {
    throw new ApiError(404, "PAGE_NOT_FOUND", "页面不存在");
  }

  const frames = resolvePageFrames(document.pages, document.links);
  const size = nodeSize(frames.get(nodeId) ?? null);
  assertScreenshotSize(size.width, size.height, "页面");
  const clampedScale = clampScale(scale);
  const context = buildRenderContext(resolvedPages, frames);
  const body = renderPageNode(
    node,
    context,
    0,
    0,
    new Set<string>(),
  );
  const html = documentHtml(size.width, size.height, "#fff", body);
  const data = await captureRenderedHtml(
    html,
    size.width,
    size.height,
    clampedScale,
  );

  return {
    node,
    width: size.width,
    height: size.height,
    scale: clampedScale,
    data,
    updatedAt: document.updatedAt,
  };
}

export async function capturePageScreenshot(
  userId: string,
  projectId: string,
  pageId: string,
  scale = 1,
) {
  const result = await renderNodeCapture(
    userId,
    projectId,
    pageId,
    scale,
  );
  return {
    pageId,
    pageName: result.node.name,
    width: result.width,
    height: result.height,
    scale: result.scale,
    mimeType: "image/png",
    data: result.data,
    updatedAt: result.updatedAt,
  };
}

export async function captureNodeScreenshot(
  userId: string,
  projectId: string,
  nodeId: string,
  scale = 1,
) {
  const result = await renderNodeCapture(
    userId,
    projectId,
    nodeId,
    scale,
  );
  return {
    projectId,
    nodeId,
    nodeName: result.node.name,
    width: result.width,
    height: result.height,
    scale: result.scale,
    mimeType: "image/png",
    data: result.data,
    updatedAt: result.updatedAt,
  };
}

export async function captureCanvasScreenshot(
  userId: string,
  projectId: string,
  scale = 1,
) {
  const document = getProjectCanvas(userId, projectId);
  const resolvedPages = resolveCanvasPageStyles(
    document.pages,
    document.links,
  );
  const frames = resolvePageFrames(document.pages, document.links);
  const pagesById = new Map(
    resolvedPages.map((page) => [page.id, page]),
  );
  const roots = resolvedPages.filter(
    (page) => !page.parentId || !pagesById.has(page.parentId),
  );

  if (roots.length === 0) {
    throw new ApiError(
      400,
      "SCREENSHOT_EMPTY_CANVAS",
      "画布没有可截图的页面",
    );
  }

  const rootFrames = roots
    .map((page) => frames.get(page.id) ?? null)
    .filter((frame): frame is CanvasResolvedFrame => frame !== null);
  if (rootFrames.length === 0) {
    throw new ApiError(
      400,
      "SCREENSHOT_EMPTY_CANVAS",
      "画布没有可截图的页面",
    );
  }

  const minX = Math.min(...rootFrames.map((frame) => frame.worldX));
  const minY = Math.min(...rootFrames.map((frame) => frame.worldY));
  const maxX = Math.max(
    ...rootFrames.map((frame) => frame.worldX + frame.width),
  );
  const maxY = Math.max(
    ...rootFrames.map((frame) => frame.worldY + frame.height),
  );
  const contentWidth = Math.max(1, maxX - minX);
  const contentHeight = Math.max(1, maxY - minY);
  const width = Math.ceil(contentWidth + CANVAS_PADDING * 2);
  const height = Math.ceil(contentHeight + CANVAS_PADDING * 2);
  assertScreenshotSize(width, height, "画布");

  const clampedScale = clampScale(scale);
  const context = buildRenderContext(resolvedPages, frames);
  const body = roots
    .map((page) => {
      const frame = frames.get(page.id) ?? null;
      const left =
        (frame ? frame.worldX : page.x) - minX + CANVAS_PADDING;
      const top =
        (frame ? frame.worldY : page.y) - minY + CANVAS_PADDING;
      return renderPageNode(
        page,
        context,
        left,
        top,
        new Set<string>(),
      );
    })
    .join("");
  const html = documentHtml(width, height, "#eef2f8", body);
  const data = await captureRenderedHtml(
    html,
    width,
    height,
    clampedScale,
  );

  return {
    projectId,
    width,
    height,
    scale: clampedScale,
    mimeType: "image/png",
    data,
    updatedAt: document.updatedAt,
    pageCount: roots.length,
    nodeCount: resolvedPages.length,
    bounds: {
      x: minX,
      y: minY,
      width: contentWidth,
      height: contentHeight,
    },
  };
}
