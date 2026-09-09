/**
 * Provider: Ollama (local).
 * Self-contained: owns its models, connection type, and validation.
 */

import type { Model, Provider } from "../types.ts";
import { PROVIDER_OLLAMA } from "./ids.ts";

export type OllamaConnection = { baseUrl: string; port: number };

const models: Model[] = [
  {
    id: "nomic-embed-text",
    displayName: "nomic-embed-text:latest",
    capabilities: { embedding: true },
    defaults: { embeddingDimensions: 768 },
  },
  {
    id: "embeddinggemma",
    displayName: "embeddinggemma:latest",
    capabilities: { embedding: true },
    defaults: { embeddingDimensions: 768 },
  },
];

export const provider: Provider = {
  id: PROVIDER_OLLAMA,
  displayName: "Ollama (local)",
  models,
};

function isValidUri(value: unknown): value is string {
  if (typeof value !== "string" || value === "") return false;
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

function isPositiveInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

export function validateConnection(
  value: unknown,
): { ok: true; connection: OllamaConnection } | { ok: false; error: string } {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: "must be an object with baseUrl and port" };
  }
  const keys = Object.keys(value as Record<string, unknown>);
  if (!keys.every((k) => k === "baseUrl" || k === "port")) {
    return { ok: false, error: "only baseUrl and port are allowed" };
  }
  const baseUrl = (value as Record<string, unknown>).baseUrl;
  const port = (value as Record<string, unknown>).port;
  if (!isValidUri(baseUrl)) {
    return { ok: false, error: "baseUrl must be a valid URI" };
  }
  if (!isPositiveInt(port)) {
    return { ok: false, error: "port must be a positive integer" };
  }
  return { ok: true, connection: { baseUrl, port } };
}
