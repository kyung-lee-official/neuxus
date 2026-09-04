/**
 * Per-model connection resolver.
 *
 * Combines the provider's hardcoded `baseUrl` with the per-model
 * overrides (`baseUrl`, `port`) stored in
 * `app_model_config.connections`. Used by the routing layer when
 * constructing adapter clients.
 *
 * Override rules:
 *   - `baseUrl` override → replaces the provider base URL entirely.
 *     Useful for an on-prem Ollama.
 *   - `port` override → replaces the port of the (provider default or
 *     overridden) base URL.
 *   - `apiKey` override → sent as the Authorization header (Ollama) or
 *     `x-api-key` (Anthropic-compatible).
 */

import type { ModelConnection, Provider } from "./types.ts";

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
  connection: ModelConnection,
): ResolvedConnection {
  const baseUrl = connection.baseUrl
    ? applyPortOverride(connection.baseUrl, connection.port)
    : applyPortOverride(provider.baseUrl, connection.port);
  return {
    baseUrl: baseUrl.replace(/\/$/, ""),
    apiKey: connection.apiKey ?? null,
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
