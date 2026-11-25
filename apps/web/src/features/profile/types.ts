import type {
  ModelProvider,
  ModelProviderModel,
  VCodePurpose,
} from "../../lib/api";

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

export interface ModelEditRequest {
  providerId: string;
  providerName: string;
  model: ModelProviderModel;
  onSaved: (provider: ModelProvider) => void;
}

export type RequestModelEdit = (request: ModelEditRequest) => void;

export interface ModelTestRequest {
  providerId: string;
  providerName: string;
  model: ModelProviderModel;
}

export type RequestModelTest = (request: ModelTestRequest) => void;
