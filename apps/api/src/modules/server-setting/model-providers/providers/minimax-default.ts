/**
 * Provider: Minimax (default plan). Anthropic-compatible.
 * Self-contained: owns its models, connection type, and validation.
 */

import type { Model, Provider } from "../types.ts";
import { PROVIDER_MINIMAX_DEFAULT } from "./ids.ts";

export type MinimaxDefaultConnection = { apiKey: string };

const models: Model[] = [
  {
    id: "MiniMax-M3",
    displayName: "MiniMax-M3",
    capabilities: { text: true, vision: true },
    defaults: {
      contextWindowTokens: 1_000_000,
      maxOutputTokens: 4096,
      temperature: 1,
    },
  },
];

export const provider: Provider = {
  id: PROVIDER_MINIMAX_DEFAULT,
  displayName: "Minimax",
  baseUrl: "https://api.minimaxi.com/anthropic",
  headers: { "anthropic-version": "2023-06-01" },
  models,
};

function isValidApiKey(value: unknown): value is string {
  return typeof value === "string" && value !== "" && value === value.trim();
}

export function validateConnection(
  value: unknown,
):
  | { ok: true; connection: MinimaxDefaultConnection }
  | { ok: false; error: string } {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: "must be an object with apiKey" };
  }
  const keys = Object.keys(value as Record<string, unknown>);
  if (!keys.every((k) => k === "apiKey")) {
    return { ok: false, error: "only apiKey is allowed" };
  }
  const apiKey = (value as Record<string, unknown>).apiKey;
  if (!isValidApiKey(apiKey)) {
    return { ok: false, error: "apiKey must be a non-empty, untrimmed string" };
  }
  return { ok: true, connection: { apiKey } };
}
