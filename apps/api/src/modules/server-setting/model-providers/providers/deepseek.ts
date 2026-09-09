/**
 * Provider: DeepSeek. Anthropic-compatible.
 * Self-contained: owns its models, connection type, and validation.
 */

import type { Model, Provider } from "../types.ts";
import { PROVIDER_DEEPSEEK } from "./ids.ts";

export type DeepSeekConnection = { apiKey: string };

const models: Model[] = [
  {
    id: "deepseek-v4-flash",
    displayName: "DeepSeek V4 Flash",
    capabilities: { text: true },
    defaults: {
      contextWindowTokens: 128_000,
      maxOutputTokens: 8192,
    },
  },
  {
    id: "deepseek-v4-pro",
    displayName: "DeepSeek V4 Pro",
    capabilities: { text: true },
    defaults: {
      contextWindowTokens: 128_000,
      maxOutputTokens: 8192,
    },
  },
  {
    id: "deepseek-v4-flash-vision-exp",
    displayName: "DeepSeek V4 Flash Vision (Experimental)",
    capabilities: { text: true, vision: true },
    defaults: {
      contextWindowTokens: 128_000,
      maxOutputTokens: 8192,
    },
  },
];

export const provider: Provider = {
  id: PROVIDER_DEEPSEEK,
  displayName: "DeepSeek",
  baseUrl: "https://api.deepseek.com/anthropic",
  headers: { "anthropic-version": "2023-06-01" },
  models,
};

function isValidApiKey(value: unknown): value is string {
  return typeof value === "string" && value !== "" && value === value.trim();
}

export function validateConnection(
  value: unknown,
): { ok: true; connection: DeepSeekConnection } | { ok: false; error: string } {
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
