/**
 * Per-model capability diagnostics for the providers page.
 *
 * `runTestEmbed` exercises the `embedding` capability; `runTestChat`
 * exercises the `text` capability. Each runs on an explicit catalog model
 * over its provider's saved connection (no task assignment). Task-scoped
 * diagnostics live in the `task-model-map` admin module.
 */

import { getModel, getProviderById } from "./providers/catalog.ts";
import {
  PROVIDER_DEEPSEEK,
  PROVIDER_MINIMAX_DEFAULT,
  PROVIDER_MINIMAX_TOKEN_PLAN,
  PROVIDER_OLLAMA,
} from "./providers/types.ts";

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
 * vector (no cosine search). Looks the model up by its `(providerId,
 * modelId)` pair, checks the `embedding` capability, then calls the
 * provider's own `embed` over its saved connection.
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
  const provider = getProviderById(target.providerId);
  if (!provider) {
    throw new Error(`Unknown provider: ${target.providerId}`);
  }
  if (provider.id !== PROVIDER_OLLAMA) {
    throw new Error(
      `Embed test is not implemented for provider: ${provider.id}`,
    );
  }
  const vectors = await provider.embed(model.id, [trimmed]);
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
 * connection. Looks the model up by its `(providerId, modelId)` pair,
 * checks the `text` capability, then calls the provider's own `chat`.
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
  const response = await provider.chat(model.id, "Hi, how are you?");
  return { modelId: model.id, response };
}
