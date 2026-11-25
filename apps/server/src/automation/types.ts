import type { AutomationCondition } from "./conditions.js";
import type {
  ActionField,
  AutomationActionDefinition,
} from "./actions.js";
import type { LocalizedText } from "./signals.js";

export interface AutomationSignalDto {
  key: string;
  title: LocalizedText;
  description: LocalizedText;
  category:
    | "preferences"
    | "models"
    | "mcp"
    | "realtime"
    | "account"
    | "custom";
  builtIn: boolean;
  payloadExample: Record<string, unknown>;
  triggerCount: number;
  createdAt: number | null;
}

export interface AutomationActionDto {
  type: string;
  config: Record<string, unknown>;
}

export interface AutomationRunSummaryDto {
  id: string;
  triggerId: string;
  triggerName: string;
  signalKey: string;
  status: string;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: number;
  finishedAt: number | null;
}

export interface AutomationTriggerDto {
  id: string;
  name: string;
  signalKey: string;
  enabled: boolean;
  condition: AutomationCondition;
  actions: AutomationActionDto[];
  cooldownMs: number;
  lastRunAt: number | null;
  lastRun: AutomationRunSummaryDto | null;
  createdAt: number;
  updatedAt: number;
}

export interface AutomationRunStepDto {
  id: string;
  stepIndex: number;
  actionType: string;
  status: string;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  errorCode: string | null;
  errorMessage: string | null;
  startedAt: number | null;
  finishedAt: number | null;
}

export interface AutomationRunDto extends AutomationRunSummaryDto {
  payload: Record<string, unknown>;
  steps: AutomationRunStepDto[];
  startedAt: number | null;
  cancelRequestedAt: number | null;
}

export interface AutomationActionCatalogItem {
  type: string;
  title: LocalizedText;
  description: LocalizedText;
  fields: ActionField[];
}

export type AutomationActionDefinitionDto = AutomationActionDefinition;
