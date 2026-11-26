export type CanvasTool = "select" | "move" | "hand";

export const CANVAS_TOOL_SHORTCUTS: Record<CanvasTool, string> = {
  select: "V",
  move: "M",
  hand: "H",
};
