import {
  useEffect,
  useRef,
  type Dispatch,
  type SetStateAction,
} from "react";

import type { CanvasPage } from "./canvasDocument";

const MAX_HISTORY = 100;

export function useCanvasHistory(
  pages: CanvasPage[],
  setPages: Dispatch<SetStateAction<CanvasPage[]>>,
  resetKey: string,
) {
  const pagesRef = useRef(pages);
  const undoRef = useRef<CanvasPage[][]>([]);
  const redoRef = useRef<CanvasPage[][]>([]);
  const transactionRef = useRef<CanvasPage[] | null>(null);

  useEffect(() => {
    pagesRef.current = pages;
  }, [pages]);

  useEffect(() => {
    undoRef.current = [];
    redoRef.current = [];
    transactionRef.current = null;
  }, [resetKey]);

  const applyPages = (next: CanvasPage[]) => {
    pagesRef.current = next;
    setPages(next);
  };

  const resolveNext = (update: SetStateAction<CanvasPage[]>) => {
    return typeof update === "function"
      ? (update as (current: CanvasPage[]) => CanvasPage[])(
          pagesRef.current,
        )
      : update;
  };

  const commit = (update: SetStateAction<CanvasPage[]>) => {
    const current = pagesRef.current;
    const next = resolveNext(update);
    if (next === current) return false;

    undoRef.current.push(current);
    if (undoRef.current.length > MAX_HISTORY) {
      undoRef.current.shift();
    }
    redoRef.current = [];
    applyPages(next);
    return true;
  };

  const transient = (update: SetStateAction<CanvasPage[]>) => {
    const next = resolveNext(update);
    if (next === pagesRef.current) return;
    applyPages(next);
  };

  const beginTransaction = () => {
    transactionRef.current = pagesRef.current;
  };

  const endTransaction = () => {
    const snapshot = transactionRef.current;
    transactionRef.current = null;
    if (!snapshot || snapshot === pagesRef.current) return;

    undoRef.current.push(snapshot);
    if (undoRef.current.length > MAX_HISTORY) {
      undoRef.current.shift();
    }
    redoRef.current = [];
  };

  const undo = () => {
    const previous = undoRef.current.pop();
    if (!previous) return false;

    redoRef.current.push(pagesRef.current);
    transactionRef.current = null;
    applyPages(previous);
    return true;
  };

  const redo = () => {
    const next = redoRef.current.pop();
    if (!next) return false;

    undoRef.current.push(pagesRef.current);
    transactionRef.current = null;
    applyPages(next);
    return true;
  };

  return {
    commit,
    transient,
    beginTransaction,
    endTransaction,
    undo,
    redo,
    canUndo: () => undoRef.current.length > 0,
    canRedo: () => redoRef.current.length > 0,
  };
}
