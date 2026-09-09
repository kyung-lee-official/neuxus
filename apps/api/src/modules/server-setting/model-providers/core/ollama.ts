/**
 * Provider: Ollama (local).
 * Self-contained: owns its models, connection type, and validation.
 */

import { loadProviderConnection, saveProviderConnection } from "./dal.ts";
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

  /** Wire call for this provider: Ollama `/api/embed`. */
  override async embed(modelId: string, texts: string[]): Promise<number[][]> {
    const conn = await this.loadConnection();
    if (!conn || !("baseUrl" in conn) || typeof conn.baseUrl !== "string")
      throw new Error(`No connection for provider ${this.id}`);
    const res = await fetch(`${conn.baseUrl.replace(/\/$/, "")}/api/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: modelId,
        input: texts.length === 1 ? texts[0] : texts,
      }),
    });
    const raw = await res.text();
    if (!res.ok)
      throw new Error(raw.trim() || `Ollama embed failed (${res.status})`);
    let json: { embeddings?: unknown; embedding?: unknown };
    try {
      json = JSON.parse(raw);
    } catch {
      throw new Error("Ollama embed returned non-JSON");
    }
    const rows = Array.isArray(json.embeddings)
      ? json.embeddings
      : json.embedding
        ? [json.embedding]
        : [];
    const vectors = rows.map((row) => {
      if (!Array.isArray(row))
        throw new Error("Ollama embeddings: row not a number vector");
      return row.map((n) => {
        if (typeof n !== "number" || !Number.isFinite(n))
          throw new Error("Ollama embeddings: row not a number vector");
        return n;
      });
    });
    if (vectors.length !== texts.length)
      throw new Error("Ollama embeddings count mismatch");
    return vectors;
  }
}

export const provider = new OllamaProvider();
