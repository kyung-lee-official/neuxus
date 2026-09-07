/**
 * Per-model embedding diagnostic for the providers page.
 *
 * `runTestEmbed` exercises an explicit catalog model over its provider's
 * saved connection (no task assignment). Task-scoped diagnostics (embed
 * search / synthesis / captioning of the *assigned* models) live in the
 * `model-tasks` admin module.
 */

import { OllamaEmbeddingsClient } from "./adapters/ollama-embed.ts";
import {
  loadConfigByModelProviderId,
  resolveCapabilityModel,
} from "./config.ts";
import { getModelById } from "./models/catalog.ts";

export type RunTestEmbedResult = {
  embedding: number[];
  modelId: string;
  dim: number;
  inputText: string;
};

export type RunTestEmbedOptions = {
  /** Catalog model id to embed with (must declare the `embedding` capability). */
  modelId: string;
};

/**
 * Run the chosen model's embedder on a single string and return the raw
 * vector (no cosine search). Resolution goes through
 * `resolveModelByModelId`, so it tests exactly the clicked model over its
 * provider's saved connection — no embedding-task assignment is required.
 */
export async function runTestEmbed(
  text: string,
  options: RunTestEmbedOptions,
): Promise<RunTestEmbedResult> {
  const trimmed = text.trim();
  if (trimmed === "") {
    throw new Error("text is required");
  }
  const model = getModelById(options.modelId);
  if (!model) {
    throw new Error(`Unknown model id: ${options.modelId}`);
  }
  const connection = await loadConfigByModelProviderId(model.providerId);
  const resolved = resolveCapabilityModel(
    options.modelId,
    "embedding",
    connection ? { [model.providerId]: connection } : {},
  );
  if (resolved.provider.requestShape !== "ollama-embed") {
    throw new Error(
      `Embed capability is not implemented for requestShape: ${resolved.provider.requestShape}`,
    );
  }
  const client = new OllamaEmbeddingsClient({
    baseUrl: resolved.connection.baseUrl,
    apiKey: resolved.connection.apiKey,
  });
  const vectors = await client.embed(resolved.model.id, [trimmed]);
  const embedding = vectors[0];
  if (!embedding) {
    throw new Error("Embedder returned no vector");
  }
  return {
    embedding,
    modelId: resolved.model.id,
    dim: embedding.length,
    inputText: trimmed,
  };
}
