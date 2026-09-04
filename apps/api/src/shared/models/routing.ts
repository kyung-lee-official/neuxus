/**
 * Routing layer — single entry point for "give me an X for the
 * currently-configured model".
 *
 * Callers depend on `getEmbedder`, `getSynthesizer`,
 * `getImageDescriber`, and `getEmbedModelId`. They never touch the
 * catalog or providers directly.
 *
 * `getEmbedModelId` is the pgvector query-key for "is this row stale
 * for the configured embedding model" — it must match the value written
 * by the embedder into `kb_children.embedding_model`.
 */

import { createChatClient } from "./clients/chat.ts";
import { createEmbedClient } from "./clients/embed.ts";
import { createVisionClient } from "./clients/vision.ts";
import { loadModelConfig, resolveModel } from "./config.ts";
import { requireApiKey } from "./connection.ts";
import type { Embedder, ImageDescriber, Synthesizer } from "./types.ts";

export type GetSynthesizerOptions = {
  userId?: string;
};

export async function getSynthesizer(
  options?: GetSynthesizerOptions,
): Promise<Synthesizer> {
  const config = await loadModelConfig();
  const { model, provider, connection } = resolveModel("llm", config);
  return createChatClient({
    model,
    provider,
    connection,
    apiKey: requireApiKey(provider, connection.apiKey),
    userId: options?.userId,
  });
}

export type GetImageDescriberOptions = {
  userId?: string;
};

export async function getImageDescriber(
  options?: GetImageDescriberOptions,
): Promise<ImageDescriber> {
  const config = await loadModelConfig();
  const { model, provider, connection } = resolveModel("vision", config);
  return createVisionClient({
    model,
    provider,
    connection,
    apiKey: requireApiKey(provider, connection.apiKey),
  });
}

export type GetEmbedderOptions = {
  userId?: string;
};

export async function getEmbedder(
  options?: GetEmbedderOptions,
): Promise<Embedder> {
  const config = await loadModelConfig();
  const { model, provider, connection } = resolveModel("embedding", config);
  return createEmbedClient({
    model,
    provider,
    connection,
  });
}

/**
 * The catalog model id of the currently-configured embedding model.
 * Used as `embedding_model` in pgvector queries / row writes.
 */
export async function getEmbedModelId(): Promise<string> {
  const config = await loadModelConfig();
  const { model } = resolveModel("embedding", config);
  return model.id;
}
