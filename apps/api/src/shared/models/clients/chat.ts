/**
 * Chat (LLM) capability client.
 *
 * Wraps an `AnthropicMessagesClient` and returns the legacy
 * `Synthesizer` interface (used by `modules/query/answer.ts`). Also
 * wraps the call in a child logger so every request/response hits
 * `app_log` — preserving the existing
 * `synthesis ok` / `synthesis error` row format.
 */

import { childLogger } from "../../log/index.ts";
import {
  AnthropicMessagesClient,
  textFromAnthropicResponse,
} from "../adapters/anthropic-messages.ts";
import type {
  Model,
  Provider,
  ResolvedConnection,
  Synthesizer,
} from "../types.ts";

const synthesisLog = childLogger({ module: "synthesis" }, "synthesis");

/**
 * System prompt sent on every chat request. Fixed across models — chat is
 * a task behavior (RAG-style Q&A), not a model property. Exposed so the
 * logging wrapper can include it in `app_log`.
 */
export const CHAT_SYSTEM_PROMPT =
  "Answer ONLY the user's current question (the last line of the user message). " +
  "Use the knowledge-base parents, personal memory, and recent conversation provided. " +
  "Recent conversation is for understanding the user — do NOT continue or repeat prior topics unless the current question explicitly references it. " +
  "If the knowledge base does not contain the answer, say so clearly.";

const DEFAULT_TEMPERATURE = 1;

export type ChatClientOptions = {
  model: Model;
  provider: Provider;
  /** Resolved `baseUrl` + `apiKey` for this provider. Routed upstream via
   * `requireApiKey` so `apiKey` is non-null for cloud providers. */
  connection: ResolvedConnection;
  /** Convenience: `connection.apiKey` validated non-null. Routed via
   * `requireApiKey` upstream; kept as a separate parameter so the
   * AnthropicMessagesClient constructor (which requires `string`) keeps
   * its existing shape. */
  apiKey: string;
  /** Owner of the request. Stamped on every `app_log` row this client emits. */
  userId?: string;
};

export type CreateChatClient = (options: ChatClientOptions) => Synthesizer;

export const createChatClient: CreateChatClient = ({
  model,
  provider,
  connection,
  apiKey,
  userId,
}) => {
  const client = new AnthropicMessagesClient({
    baseUrl: connection.baseUrl,
    apiKey,
    headers: provider.headers,
  });
  const maxTokens = model.defaults.maxOutputTokens ?? 4096;
  const temperature = model.defaults.temperature ?? DEFAULT_TEMPERATURE;

  const inner: Synthesizer = {
    async synthesize(prompt: string): Promise<string> {
      const request = {
        model: model.id,
        max_tokens: maxTokens,
        temperature,
        system: CHAT_SYSTEM_PROMPT,
        messages: [
          {
            role: "user" as const,
            content: [{ type: "text" as const, text: prompt }],
          },
        ],
      };
      const start = performance.now();
      try {
        const json = await client.sendMessage(request);
        const response = textFromAnthropicResponse(json);
        if (!response) {
          throw new Error(`${model.displayName} returned empty content`);
        }
        synthesisLog.info("synthesis ok", {
          userId: userId ?? null,
          providerId: provider.id,
          modelId: model.id,
          maxTokens,
          system: CHAT_SYSTEM_PROMPT,
          temperature,
          promptChars: prompt.length,
          prompt,
          request,
          response,
          latencyMs: Math.round(performance.now() - start),
          status: "ok",
        });
        return response;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        synthesisLog.error("synthesis error", {
          userId: userId ?? null,
          providerId: provider.id,
          modelId: model.id,
          maxTokens,
          system: CHAT_SYSTEM_PROMPT,
          temperature,
          promptChars: prompt.length,
          prompt,
          request,
          error: message,
          latencyMs: Math.round(performance.now() - start),
          status: "error",
        });
        throw err;
      }
    },
  };

  return inner;
};

/** Approximate token count used by the prompt window-fit helper. */
export function estimatePromptTokens(text: string): number {
  if (text.length === 0) return 0;
  return Math.ceil(text.length / 4);
}

/**
 * Trim the prompt so estimated tokens + `max_tokens` fit the model
 * window. Keeps the end (current question).
 */
export function fitPromptToWindow(
  prompt: string,
  model: Pick<Model, "defaults">,
  maxTokens: number,
): string {
  const window = model.defaults.contextWindowTokens;
  if (!window || window < 1 || maxTokens < 1) return prompt;
  if (maxTokens >= window) return prompt;
  const maxChars = (window - maxTokens) * 4;
  if (prompt.length <= maxChars) return prompt;
  const marker = "\n\n[context truncated]";
  const keep = Math.max(0, maxChars - marker.length);
  return `${prompt.slice(prompt.length - keep)}${marker}`;
}
