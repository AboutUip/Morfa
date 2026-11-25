import type { VCodePurpose } from "../../lib/api";

export type { VCodePurpose };

export type RequestVCode = (
  purpose: VCodePurpose,
  onVerified: (ticket: string) => Promise<void> | void,
) => void;

export interface VCodeStep {
  kind: "vcode";
  purpose: VCodePurpose;
  onVerified: (ticket: string) => Promise<void> | void;
}

export type RequestPassword = (
  descriptionKey: string,
  onVerified: (
    password: string,
  ) => Promise<VCodeStep | void> | VCodeStep | void,
) => void;
