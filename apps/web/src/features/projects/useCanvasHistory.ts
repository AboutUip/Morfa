import {
  useEffect,
  useRef,
  type Dispatch,
  type SetStateAction,
} from "react";

import type { CanvasDocument } from "./canvasDocument";

const MAX_HISTORY = 100;

export function useCanvasHistory(
  document: CanvasDocument,
  setDocument: Dispatch<SetStateAction<CanvasDocument>>,
  resetKey: string,
) {
  const documentRef = useRef(document);
  const undoRef = useRef<CanvasDocument[]>([]);
  const redoRef = useRef<CanvasDocument[]>([]);
  const transactionRef = useRef<CanvasDocument | null>(null);

  useEffect(() => {
    documentRef.current = document;
  }, [document]);

  useEffect(() => {
    undoRef.current = [];
    redoRef.current = [];
    transactionRef.current = null;
  }, [resetKey]);

  const applyDocument = (next: CanvasDocument) => {
    documentRef.current = next;
    setDocument(next);
  };

  const resolveNext = (update: SetStateAction<CanvasDocument>) => {
    return typeof update === "function"
      ? (update as (current: CanvasDocument) => CanvasDocument)(
          documentRef.current,
        )
      : update;
  };

  const commit = (update: SetStateAction<CanvasDocument>) => {
    const current = documentRef.current;
    const next = resolveNext(update);
    if (next === current) return false;

    undoRef.current.push(current);
    if (undoRef.current.length > MAX_HISTORY) {
      undoRef.current.shift();
    }
    redoRef.current = [];
    applyDocument(next);
    return true;
  };

  const transient = (update: SetStateAction<CanvasDocument>) => {
    const next = resolveNext(update);
    if (next === documentRef.current) return;
    applyDocument(next);
  };

  const beginTransaction = () => {
    transactionRef.current = documentRef.current;
  };

  const endTransaction = () => {
    const snapshot = transactionRef.current;
    transactionRef.current = null;
    if (!snapshot || snapshot === documentRef.current) return;

    undoRef.current.push(snapshot);
    if (undoRef.current.length > MAX_HISTORY) {
      undoRef.current.shift();
    }
    redoRef.current = [];
  };

  const undo = () => {
    const previous = undoRef.current.pop();
    if (!previous) return false;

    redoRef.current.push(documentRef.current);
    transactionRef.current = null;
    applyDocument(previous);
    return true;
  };

  const redo = () => {
    const next = redoRef.current.pop();
    if (!next) return false;

    undoRef.current.push(documentRef.current);
    transactionRef.current = null;
    applyDocument(next);
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
