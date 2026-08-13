import type { ResolvedEmbedSettings } from "./defaults.ts";
import type { Embedder } from "./types.ts";

type OllamaEmbedResponse = {
  embeddings?: unknown;
  embedding?: unknown;
};

function asNumberVector(value: unknown): number[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const out: number[] = [];
  for (const n of value) {
    if (typeof n !== "number" || !Number.isFinite(n)) return null;
    out.push(n);
  }
  return out;
}

function vectorsFromResponse(json: OllamaEmbedResponse): number[][] | null {
  if (Array.isArray(json.embeddings)) {
    const vectors: number[][] = [];
    for (const row of json.embeddings) {
      const v = asNumberVector(row);
      if (!v) return null;
      vectors.push(v);
    }
    return vectors.length > 0 ? vectors : null;
  }
  const single = asNumberVector(json.embedding);
  return single ? [single] : null;
}

/** Ollama HTTP embedder. Callers should depend on `Embedder`, not this file. */
export function createOllamaEmbedder(
  settings: Pick<
    ResolvedEmbedSettings,
    "host" | "port" | "apiKey" | "embeddingModel"
  >,
): Embedder {
  const base = `http://${settings.host}:${settings.port}`;

  return {
    async embed(texts: string[]): Promise<number[][]> {
      if (texts.length === 0) return [];

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (settings.apiKey) {
        headers.Authorization = `Bearer ${settings.apiKey}`;
      }

      const res = await fetch(`${base}/api/embed`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: settings.embeddingModel,
          input: texts.length === 1 ? texts[0] : texts,
        }),
      });
      const body = await res.text();
      if (!res.ok) {
        throw new Error(`Ollama embed failed (${res.status})`);
      }
      let json: OllamaEmbedResponse;
      try {
        json = JSON.parse(body) as OllamaEmbedResponse;
      } catch {
        throw new Error("Ollama embed returned non-JSON");
      }
      const vectors = vectorsFromResponse(json);
      if (!vectors || vectors.length !== texts.length) {
        throw new Error("Ollama embed returned unexpected embeddings");
      }
      return vectors;
    },
  };
}
