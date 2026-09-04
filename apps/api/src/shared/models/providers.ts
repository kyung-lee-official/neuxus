/**
 * Provider catalog.
 *
 * Each provider owns one wire format (the `requestShape`) and a base URL.
 * Models reference providers by id; per-model `defaults` can override
 * provider-level base URL only via the per-slot override stored in
 * `app_model_provider_config`.
 */

import type { Provider } from "./types.ts";

export const ANTHROPIC_VERSION = "2023-06-01";

const anthropicHeaders = {
  "anthropic-version": ANTHROPIC_VERSION,
} as const;

export const PROVIDERS: readonly Provider[] = [
  {
    id: "minimax-default",
    displayName: "Minimax",
    baseUrl: "https://api.minimaxi.com/anthropic",
    requestShape: "anthropic-messages",
    headers: anthropicHeaders,
    userInputs: ["apiKey"],
  },
  {
    id: "minimax-token-plan",
    displayName: "Minimax (Token Plan)",
    baseUrl: "https://api.minimaxi.com/anthropic/v1/token-plan",
    requestShape: "anthropic-messages",
    headers: anthropicHeaders,
    userInputs: ["apiKey"],
  },
  {
    id: "deepseek",
    displayName: "DeepSeek",
    baseUrl: "https://api.deepseek.com/anthropic",
    requestShape: "anthropic-messages",
    headers: anthropicHeaders,
    userInputs: ["apiKey"],
  },
  {
    id: "ollama",
    displayName: "Ollama (local)",
    baseUrl: "http://127.0.0.1:11434",
    requestShape: "ollama-embed",
    userInputs: ["baseUrl", "port"],
  },
] as const;

export function getProviderById(id: string): Provider | null {
  return PROVIDERS.find((p) => p.id === id) ?? null;
}
