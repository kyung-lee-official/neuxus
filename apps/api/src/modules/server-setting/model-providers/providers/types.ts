/**
 * Provider domain types: canonical provider ids, the `Provider` shape, and
 * `Model` (models are scoped within their provider).
 */

import type { CapabilityTag } from "../types.ts";

/** Canonical provider ids — single source; import these, don't use literals. */
export const PROVIDER_MINIMAX_DEFAULT = "minimax-default";
export const PROVIDER_MINIMAX_TOKEN_PLAN = "minimax-token-plan";
export const PROVIDER_DEEPSEEK = "deepseek";
export const PROVIDER_OLLAMA = "ollama";

export type ProviderId =
  | typeof PROVIDER_MINIMAX_DEFAULT
  | typeof PROVIDER_MINIMAX_TOKEN_PLAN
  | typeof PROVIDER_DEEPSEEK
  | typeof PROVIDER_OLLAMA;

export type Model = {
  /** Model id, unique *within its provider* (scoped by `Provider.id`). */
  id: string;
  /** Human-readable name shown in the admin dropdown. */
  displayName: string;
  /** What this model can do. */
  capabilities: Partial<Record<CapabilityTag, true>>;
  /** Hardcoded per-model defaults (catalog owns the wire params). */
  defaults: {
    contextWindowTokens?: number;
    maxOutputTokens?: number;
    embeddingDimensions?: number;
    temperature?: number;
  };
};

/** A provider in the catalog — shape only, no behavior. */
export type Provider = {
  id: string;
  displayName: string;
  /** Fixed upstream endpoint, when the provider's connection has no base URL. */
  baseUrl?: string;
  /** Extra headers always sent (e.g. `anthropic-version`). */
  headers?: Record<string, string>;
  /** Models this provider serves. The provider scopes model identity. */
  models: Model[];
};
