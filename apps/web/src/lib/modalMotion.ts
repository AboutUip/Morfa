export const MODAL_EXIT_MS = 180;

export function getModalExitMs(): number {
  if (typeof window === "undefined") return 0;

  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? 0
    : MODAL_EXIT_MS;
}
