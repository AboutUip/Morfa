import {
  createPageId,
  renameStyleReferences,
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
  const sourceClone = clonePage(source);
  const id = createPageId(pages);

  return {
    ...sourceClone,
    id,
    name: uniquePageName(baseName, pages),
    styles: renameStyleReferences(sourceClone.styles, source.id, id),
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
  const pageClone = clonePage(page);
  const id = createPageId(pages);

  return {
    ...pageClone,
    id,
    name: uniquePageName(baseName, pages),
    styles: renameStyleReferences(pageClone.styles, page.id, id),
    x: page.x + PASTE_OFFSET,
    y: page.y + PASTE_OFFSET,
  };
}
