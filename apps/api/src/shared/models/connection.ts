/**
 * Per-slot connection resolver.
 *
 * Combines the provider's hardcoded `baseUrl` with the per-slot
 * overrides (`baseUrl`, `port`) stored in `app_model_config`. Used by
 * the routing layer when constructing adapter clients.
 *
 * Override rules:
 *   - `baseUrl` slot override → replaces the provider base URL entirely.
 *     Useful for an on-prem Ollama.
 *   - `port` slot override → replaces the port of the provider base URL.
 *     Most useful together with the provider default `baseUrl` when the
 *     user wants to keep the same host but change the port.
 *   - `apiKey` slot override → sent as the Authorization header
 *     (Ollama) or `x-api-key` (Anthropic-compatible).
 */

import type { ModelSlot, Provider } from "./types.ts";

export type ResolvedConnection = {
  baseUrl: string;
  apiKey: string | null;
};

function applyPortOverride(
  baseUrl: string,
  port: number | null | undefined,
): string {
  if (port == null) return baseUrl;
  try {
    const u = new URL(baseUrl);
    u.port = String(port);
    return u.toString().replace(/\/$/, "");
  } catch {
    return baseUrl;
  }
}

export function resolveConnection(
  provider: Provider,
  slot: ModelSlot,
): ResolvedConnection {
  const baseUrl = slot.baseUrl
    ? applyPortOverride(slot.baseUrl, slot.port)
    : applyPortOverride(provider.baseUrl, slot.port);
  return {
    baseUrl: baseUrl.replace(/\/$/, ""),
    apiKey: slot.apiKey ?? null,
  };
}

/**
 * Throw a descriptive error when a cloud provider's API key is missing.
 * Local providers (Ollama) accept a null key.
 */
export function requireApiKey(
  provider: Provider,
  apiKey: string | null,
): string {
  if (provider.userInputs.includes("apiKey") && !apiKey) {
    throw new Error(`apiKey is required for provider ${provider.id}`);
  }
  return apiKey ?? "";
}
