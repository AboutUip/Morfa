import {
  createPageId,
  uniquePageName,
  type CanvasPage,
} from "./canvasDocument";

const PASTE_OFFSET = 24;

type ClipboardMode = "copy" | "cut";

interface ClipboardEntry {
  page: CanvasPage;
  mode: ClipboardMode;
  pasteCount: number;
}

let clipboard: ClipboardEntry | null = null;

function clonePage(page: CanvasPage): CanvasPage {
  return JSON.parse(JSON.stringify(page)) as CanvasPage;
}

export function copyPageToClipboard(
  page: CanvasPage,
  mode: ClipboardMode = "copy",
) {
  clipboard = {
    page: clonePage(page),
    mode,
    pasteCount: 0,
  };
}

export function hasPageClipboard() {
  return clipboard !== null;
}

export function pastePageFromClipboard(
  pages: CanvasPage[],
  copySuffix: string,
  position?: { x: number; y: number },
): CanvasPage | null {
  if (!clipboard) return null;

  clipboard.pasteCount += 1;
  const offset = PASTE_OFFSET * clipboard.pasteCount;
  const source = clipboard.page;
  const baseName =
    clipboard.mode === "copy" && copySuffix
      ? `${source.name} ${copySuffix}`
      : source.name;

  return {
    ...clonePage(source),
    id: createPageId(),
    name: uniquePageName(baseName, pages),
    x: position ? position.x : source.x + offset,
    y: position ? position.y : source.y + offset,
  };
}

export function duplicatePageFrom(
  page: CanvasPage,
  pages: CanvasPage[],
  copySuffix: string,
): CanvasPage {
  const baseName = copySuffix ? `${page.name} ${copySuffix}` : page.name;

  return {
    ...clonePage(page),
    id: createPageId(),
    name: uniquePageName(baseName, pages),
    x: page.x + PASTE_OFFSET,
    y: page.y + PASTE_OFFSET,
  };
}
