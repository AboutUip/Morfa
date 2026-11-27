import type { ApiKeyRow } from "../db/apiKeys.js";
import type { UserRow } from "../db/users.js";

export type McpLocale = "zh-CN" | "en-US";

export type LocalizedText = Record<McpLocale, string>;

export type McpCategory =
  | "system"
  | "appearance"
  | "profile"
  | "security"
  | "data"
  | "models"
  | "projects"
  | "canvas"
  | "layout"
  | "behavior"
  | "controls"
  | "components"
  | "runtime"
  | "screenshot"
  | "assets"
  | "lint";

export interface McpPermissionRequirements {
  vcode: boolean;
  password: boolean;
}

export interface McpKeyPermissions {
  allowVCode: boolean;
  allowPassword: boolean;
}

export interface McpPropertySchema {
  type: "string" | "boolean" | "number";
  description: string;
  enum?: readonly string[];
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  default?: string | boolean | number;
}

export interface McpInputSchema {
  type: "object";
  properties: Record<string, McpPropertySchema>;
  required?: readonly string[];
  additionalProperties?: false;
}

export interface McpExample {
  title?: LocalizedText;
  arguments: Record<string, unknown>;
}

export interface McpAnnotations {
  readOnlyHint: boolean;
  destructiveHint: boolean;
  idempotentHint: boolean;
  openWorldHint: boolean;
}

export interface McpContext {
  user: UserRow;
  apiKey: ApiKeyRow;
  origin: string;
}

export interface McpCapability {
  name: string;
  title: LocalizedText;
  description: LocalizedText;
  usage: LocalizedText;
  returns: LocalizedText;
  category: McpCategory;
  requirements: McpPermissionRequirements;
  annotations: McpAnnotations;
  inputSchema: McpInputSchema;
  examples: McpExample[];
  execute(
    context: McpContext,
    args: Record<string, unknown>,
  ): Promise<McpExecuteResult>;
}

export interface McpCapabilitySummary {
  name: string;
  title: LocalizedText;
  description: LocalizedText;
  category: McpCategory;
  requirements: McpPermissionRequirements;
  annotations: McpAnnotations;
  available: boolean | null;
}

export interface McpCapabilityDetail extends McpCapabilitySummary {
  usage: LocalizedText;
  returns: LocalizedText;
  inputSchema: McpInputSchema;
  examples: McpExample[];
}

export interface McpToolDefinition {
  name: string;
  title: string;
  description: string;
  inputSchema: McpInputSchema;
  annotations: McpAnnotations;
  _meta: {
    "morfa/category": McpCategory;
    "morfa/requiresVCode": boolean;
    "morfa/requiresPassword": boolean;
    "morfa/available": boolean;
  };
}

export interface McpInvocation {
  name: string;
  data: Record<string, unknown>;
  imageContent?: McpImageContent[];
}

export interface McpImageContent {
  type: "image";
  data: string;
  mimeType: string;
}

export interface McpStructuredResult {
  structuredContent: Record<string, unknown>;
  imageContent?: McpImageContent[];
}

export type McpExecuteResult =
  | Record<string, unknown>
  | McpStructuredResult;

export interface McpSearchOptions {
  query?: string;
  category?: McpCategory;
  availableOnly?: boolean;
}

export const REQUIRE_NONE: McpPermissionRequirements = {
  vcode: false,
  password: false,
};

export const READ_ONLY_ANNOTATIONS: McpAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

export const WRITE_ANNOTATIONS: McpAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
};

export const DESTRUCTIVE_ANNOTATIONS: McpAnnotations = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: false,
};
