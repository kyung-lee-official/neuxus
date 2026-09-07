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

export type RunTestChatOptions = {
  /** Catalog model id to chat with (must declare the `llm` capability). */
  modelId: string;
};

export type RunTestChatResult = {
  modelId: string;
  response: string;
};

/**
 * Run a one-shot chat call on the chosen model over its provider's saved
 * connection, sending the vendor's official sample request. Resolution
 * goes through `resolveCapabilityModel` (same validation as
 * `runTestEmbed`), so it tests exactly the clicked model — no llm task
 * assignment is required.
 */
export async function runTestChat(
  options: RunTestChatOptions,
): Promise<RunTestChatResult> {
  const model = getModelById(options.modelId);
  if (!model) {
    throw new Error(`Unknown model id: ${options.modelId}`);
  }
  const connection = await loadConfigByModelProviderId(model.providerId);
  const resolved = resolveCapabilityModel(
    options.modelId,
    "llm",
    connection ? { [model.providerId]: connection } : {},
  );
  if (resolved.provider.requestShape !== "anthropic-messages") {
    throw new Error(
      `LLM chat is not implemented for requestShape: ${resolved.provider.requestShape}`,
    );
  }
  const apiKey = resolved.connection.apiKey;
  if (!apiKey) {
    throw new Error(
      `No API key saved for provider ${resolved.provider.id}. Save one under Server settings → Providers first.`,
    );
  }
  const client = new AnthropicMessagesClient({
    baseUrl: resolved.connection.baseUrl,
    apiKey,
  });
  const json = await client.sendMessage({
    model: resolved.model.id,
    max_tokens: resolved.model.defaults.maxOutputTokens ?? 4096,
    temperature: resolved.model.defaults.temperature ?? 1,
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
  return { modelId: resolved.model.id, response };
}
