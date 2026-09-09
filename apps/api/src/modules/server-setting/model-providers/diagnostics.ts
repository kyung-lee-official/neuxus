/**
 * Per-model capability diagnostics for the providers page.
 *
 * `runTestEmbed` exercises the `embedding` capability; `runTestChat`
 * exercises the `text` capability. Each runs on an explicit catalog model
 * over its provider's saved connection (no task assignment). Task-scoped
 * diagnostics (embed search / synthesis / captioning of the *assigned*
 * models) live in the `task-model-map` admin module.
 */

import {
  AnthropicMessagesClient,
  textFromAnthropicResponse,
} from "./adapters/anthropic-messages.ts";
import { OllamaEmbeddingsClient } from "./adapters/ollama-embed.ts";
import { loadConfigByModelProviderId } from "./dal.ts";
import { getModel, getProviderById } from "./providers/catalog.ts";
import {
  PROVIDER_DEEPSEEK,
  PROVIDER_MINIMAX_DEFAULT,
  PROVIDER_MINIMAX_TOKEN_PLAN,
  PROVIDER_OLLAMA,
} from "./providers/ids.ts";
import type { OllamaConnection } from "./providers/ollama.ts";

/** Uniquely identifies a catalog model: names are unique within a provider. */
export type ModelTarget = {
  providerId: string;
  modelId: string;
};

export type RunTestEmbedResult = {
  embedding: number[];
  modelId: string;
  dim: number;
  inputText: string;
};

/**
 * Run the chosen model's embedder on a single string and return the raw
 * vector (no cosine search). Looks the model up by its
 * `(providerId, modelId)` pair, checks the `embedding` capability, and
 * calls the Ollama adapter over the provider's saved connection — no
 * embedding-task assignment is required.
 */
export async function runTestEmbed(
  text: string,
  target: ModelTarget,
): Promise<RunTestEmbedResult> {
  const trimmed = text.trim();
  if (trimmed === "") {
    throw new Error("text is required");
  }
  const model = getModel(target.providerId, target.modelId);
  if (!model) {
    throw new Error(`Unknown model: ${target.providerId}/${target.modelId}`);
  }
  if (model.capabilities.embedding !== true) {
    throw new Error(
      `Model ${target.providerId}/${target.modelId} does not support the embedding capability`,
    );
  }
  const connection = await loadConfigByModelProviderId(target.providerId);
  if (!connection) {
    throw new Error(
      `No saved connection for provider ${target.providerId}. Save one under Server settings → Providers first.`,
    );
  }
  const provider = getProviderById(target.providerId);
  if (!provider) {
    throw new Error(`Unknown provider: ${target.providerId}`);
  }
  if (provider.id !== PROVIDER_OLLAMA) {
    throw new Error(
      `Embed test is not implemented for provider: ${provider.id}`,
    );
  }
  if (!("baseUrl" in connection)) {
    throw new Error(`Invalid ollama connection for ${target.providerId}`);
  }
  const client = new OllamaEmbeddingsClient({
    baseUrl: (connection as OllamaConnection).baseUrl,
    apiKey: null,
  });
  const vectors = await client.embed(model.id, [trimmed]);
  const embedding = vectors[0];
  if (!embedding) {
    throw new Error("Embedder returned no vector");
  }
  return {
    embedding,
    modelId: model.id,
    dim: embedding.length,
    inputText: trimmed,
  };
}

export type RunTestChatResult = {
  modelId: string;
  response: string;
};

/**
 * Run a one-shot chat call on the chosen model over its provider's saved
 * connection, sending the vendor's official sample request. Looks the model
 * up by its `(providerId, modelId)` pair, checks the `text` capability, and
 * calls the Anthropic-compatible adapter over the saved connection — no text
 * task assignment is required.
 */
export async function runTestChat(
  target: ModelTarget,
): Promise<RunTestChatResult> {
  const model = getModel(target.providerId, target.modelId);
  if (!model) {
    throw new Error(`Unknown model: ${target.providerId}/${target.modelId}`);
  }
  if (model.capabilities.text !== true) {
    throw new Error(
      `Model ${target.providerId}/${target.modelId} does not support the text capability`,
    );
  }
  const connection = await loadConfigByModelProviderId(target.providerId);
  if (!connection) {
    throw new Error(
      `No saved connection for provider ${target.providerId}. Save one under Server settings → Providers first.`,
    );
  }
  const provider = getProviderById(target.providerId);
  if (!provider) {
    throw new Error(`Unknown provider: ${target.providerId}`);
  }
  const anthropicLike = new Set([
    PROVIDER_MINIMAX_DEFAULT,
    PROVIDER_MINIMAX_TOKEN_PLAN,
    PROVIDER_DEEPSEEK,
  ]);
  if (!anthropicLike.has(provider.id)) {
    throw new Error(
      `Chat test is not implemented for provider: ${provider.id}`,
    );
  }
  if (!("apiKey" in connection) || typeof connection.apiKey !== "string") {
    throw new Error(
      `No API key saved for provider ${target.providerId}. Save one under Server settings → Providers first.`,
    );
  }
  const baseUrl = provider.baseUrl;
  if (!baseUrl) {
    throw new Error(`No base URL for provider ${target.providerId}`);
  }
  const client = new AnthropicMessagesClient({
    baseUrl,
    apiKey: connection.apiKey,
  });
  const json = await client.sendMessage({
    model: model.id,
    max_tokens: model.defaults.maxOutputTokens ?? 4096,
    temperature: model.defaults.temperature ?? 1,
    system: "You are a helpful assistant.",
    messages: [
      {
        role: "user",
        content: [{ type: "text", text: "Hi, how are you?" }],
      },
    ],
  });
  const response = textFromAnthropicResponse(json);
  if (!response) {
    throw new Error(`${model.displayName} returned empty content`);
  }
  return { modelId: model.id, response };
}
