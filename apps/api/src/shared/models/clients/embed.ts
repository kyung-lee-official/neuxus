/**
 * Embedding capability client.
 *
 * Single provider today: Ollama (`requestShape: "ollama-embed"`).
 * The adapter is injected so a future OpenAI-compatible provider can
 * reuse the same client shape.
 */

import { OllamaEmbeddingsClient } from "../adapters/ollama-embed.ts";
import type { Embedder, Model, Provider } from "../types.ts";

export type EmbedClientOptions = {
  model: Model;
  provider: Provider;
  /** Ollama accepts but doesn't require an API key. */
  apiKey?: string | null;
};

export type CreateEmbedClient = (options: EmbedClientOptions) => Embedder;

export const createEmbedClient: CreateEmbedClient = ({
  model,
  provider,
  apiKey,
}) => {
  if (provider.requestShape !== "ollama-embed") {
    throw new Error(
      `Embed capability is not implemented for requestShape: ${provider.requestShape}`,
    );
  }
  const client = new OllamaEmbeddingsClient({
    baseUrl: provider.baseUrl,
    apiKey: apiKey ?? null,
  });
  return {
    async embed(texts: string[]): Promise<number[][]> {
      return client.embed(model.id, texts);
    },
  };
};
