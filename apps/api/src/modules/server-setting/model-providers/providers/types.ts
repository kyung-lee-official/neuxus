/**
 * Provider domain types: canonical provider ids + the `Provider` shape.
 * Lives with the providers; `Model` comes from the registry base types.
 */

import type { Model } from "../types.ts";

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
