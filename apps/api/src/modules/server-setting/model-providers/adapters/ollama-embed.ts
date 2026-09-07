/**
 * Ollama-native embeddings adapter.
 *
 * Today we only ship `nomic-embed-text:latest` over Ollama. The wire
 * format is Ollama's `/api/embed`:
 *
 *   POST {model, input} → { embeddings: number[][] }
 *
 * `input` may be a single string or an array. Response shape varies:
 *   - batch input → `embeddings: number[][]`
 *   - single input → `embedding: number[]` (some Ollama versions)
 *
 * Both are normalized to `number[][]` before returning.
 */

export type OllamaEmbeddingsClientOptions = {
  baseUrl: string;
  apiKey?: string | null;
};

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

function vectorsFromResponse(
  json: OllamaEmbedResponse,
  expected: number,
): number[][] {
  if (Array.isArray(json.embeddings)) {
    const vectors: number[][] = [];
    for (const row of json.embeddings) {
      const v = asNumberVector(row);
      if (!v) {
        throw new Error("Ollama embeddings: row not a number vector");
      }
      vectors.push(v);
    }
    if (vectors.length !== expected) {
      throw new Error(
        `Ollama embeddings count mismatch (got ${vectors.length}, expected ${expected})`,
      );
    }
    return vectors;
  }
  const single = asNumberVector(json.embedding);
  if (!single) {
    throw new Error("Ollama embeddings: response missing embedding");
  }
  if (expected !== 1) {
    throw new Error(
      `Ollama returned single embedding for batch of ${expected}`,
    );
  }
  return [single];
}

export class OllamaEmbeddingsClient {
  private readonly baseUrl: string;
  private readonly apiKey: string | null;

  constructor(options: OllamaEmbeddingsClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.apiKey = options.apiKey ?? null;
  }

  async embed(model: string, texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.apiKey) {
      headers.Authorization = `Bearer ${this.apiKey}`;
    }

    const input = texts.length === 1 ? texts[0] : texts;
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/api/embed`, {
        method: "POST",
        headers,
        body: JSON.stringify({ model, input }),
      });
    } catch (err) {
      const cause = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Ollama at ${this.baseUrl} unreachable (is Ollama running?): ${cause}`,
      );
    }
    const body = await res.text();
    if (!res.ok) {
      throw new Error(`Ollama embed failed (${res.status}): ${body.trim()}`);
    }
    let json: OllamaEmbedResponse;
    try {
      json = JSON.parse(body) as OllamaEmbedResponse;
    } catch {
      throw new Error("Ollama embed returned non-JSON");
    }
    return vectorsFromResponse(json, texts.length);
  }
}
