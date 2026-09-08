/**
 * Per-model capability diagnostics for the providers page.
 *
 * `runTestEmbed` exercises the `embedding` capability; `runTestChat`
 * exercises the `llm` capability. Each runs on an explicit catalog model
 * over its provider's saved connection (no task assignment). Task-scoped
 * diagnostics (embed search / synthesis / captioning of the *assigned*
 * models) live in the `model-tasks` admin module.
 */

import {
  AnthropicMessagesClient,
  textFromAnthropicResponse,
} from "./adapters/anthropic-messages.ts";
import { OllamaEmbeddingsClient } from "./adapters/ollama-embed.ts";
import { loadConfigByModelProviderId } from "./config.ts";
import { getModel } from "./models/catalog.ts";

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
  const connection = await loadConfigByModelProviderId(model.providerId);
  if (!connection) {
    throw new Error(
      `No saved connection for provider ${model.providerId}. Save one under Server settings → Providers first.`,
    );
  }
  const client = new OllamaEmbeddingsClient({
    baseUrl: connection.baseUrl ?? "",
    apiKey: connection.apiKey,
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
 * up by its `(providerId, modelId)` pair, checks the `llm` capability, and
 * calls the Anthropic-compatible adapter over the saved connection — no llm
 * task assignment is required.
 */
export async function runTestChat(
  target: ModelTarget,
): Promise<RunTestChatResult> {
  const model = getModel(target.providerId, target.modelId);
  if (!model) {
    throw new Error(`Unknown model: ${target.providerId}/${target.modelId}`);
  }
  if (model.capabilities.llm !== true) {
    throw new Error(
      `Model ${target.providerId}/${target.modelId} does not support the llm capability`,
    );
  }
  const connection = await loadConfigByModelProviderId(model.providerId);
  if (!connection) {
    throw new Error(
      `No saved connection for provider ${model.providerId}. Save one under Server settings → Providers first.`,
    );
  }
  const apiKey = connection.apiKey;
  if (!apiKey) {
    throw new Error(
      `No API key saved for provider ${model.providerId}. Save one under Server settings → Providers first.`,
    );
  }
  const client = new AnthropicMessagesClient({
    baseUrl: connection.baseUrl ?? "",
    apiKey,
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
