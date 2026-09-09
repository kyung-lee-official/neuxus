/**
 * Provider: Ollama (local).
 * Self-contained: owns its models, connection type, and validation.
 */

import { loadProviderConnection, saveProviderConnection } from "../dal.ts";
import { type ConnectionResult, ModelProvider } from "./provider.ts";
import type { Model } from "./types.ts";
import { PROVIDER_OLLAMA } from "./types.ts";

export type OllamaConnection = { baseUrl: string; port: number };

export class OllamaProvider extends ModelProvider<OllamaConnection> {
  override readonly id = PROVIDER_OLLAMA;
  override readonly displayName = "Ollama (local)";
  override readonly models: Model[] = [
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

  override validateConnection(
    raw: unknown,
  ): ConnectionResult<OllamaConnection> {
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
      return { ok: false, error: "must be an object with baseUrl and port" };
    }
    const keys = Object.keys(raw as Record<string, unknown>);
    if (!keys.every((k) => k === "baseUrl" || k === "port")) {
      return { ok: false, error: "only baseUrl and port are allowed" };
    }
    const baseUrl = (raw as Record<string, unknown>).baseUrl;
    if (typeof baseUrl !== "string" || baseUrl === "") {
      return { ok: false, error: "baseUrl must be a valid URI" };
    }
    try {
      new URL(baseUrl);
    } catch {
      return { ok: false, error: "baseUrl must be a valid URI" };
    }
    const port = (raw as Record<string, unknown>).port;
    if (typeof port !== "number" || !Number.isInteger(port) || port <= 0) {
      return { ok: false, error: "port must be a positive integer" };
    }
    return { ok: true, connection: { baseUrl, port } };
  }

  override async loadConnection(): Promise<OllamaConnection | null> {
    return (await loadProviderConnection(
      this.id,
    )) as unknown as OllamaConnection | null;
  }

  override async saveConnection(raw: unknown): Promise<OllamaConnection> {
    return (await saveProviderConnection(
      this.id,
      raw,
    )) as unknown as OllamaConnection;
  }
}

export const provider = new OllamaProvider();
