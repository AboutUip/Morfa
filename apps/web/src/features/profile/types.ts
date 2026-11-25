import type { VCodePurpose } from "../../lib/api";

export type { VCodePurpose };

export type RequestVCode = (
  purpose: VCodePurpose,
  onVerified: (ticket: string) => Promise<void> | void,
) => void;
