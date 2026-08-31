import { childLogger } from "../log/index.ts";
import {
  assertSynthesisBudget,
  type ResolvedSynthesisSettings,
} from "./defaults.ts";
import {
  buildMinimaxRequestBody,
  createMinimaxSynthesizer,
  MINIMAX_SYSTEM_PROMPT,
  MINIMAX_TEMPERATURE,
} from "./minimax.ts";
import type { Synthesizer } from "./types.ts";

const synthesisLog = childLogger({ module: "synthesis" }, "synthesis");

/**
 * Wrap a `Synthesizer` so every call logs the **complete content sent to
 * the LLM** (system prompt + temperature + full request body + user
 * message + response + latency + outcome) to the app logger. Errors
 * are rethrown after logging.
 */
function withSynthesisLogging(
  inner: Synthesizer,
  settings: Pick<
    ResolvedSynthesisSettings,
    "provider" | "synthesisModel" | "maxTokens"
  >,
  userId: string | null,
): Synthesizer {
  return {
    async synthesize(prompt: string): Promise<string> {
      const request = buildMinimaxRequestBody(settings, prompt);
      const start = performance.now();
      try {
        const response = await inner.synthesize(prompt);
        synthesisLog.info("synthesis ok", {
          userId,
          provider: settings.provider,
          model: settings.synthesisModel,
          maxTokens: settings.maxTokens,
          system: MINIMAX_SYSTEM_PROMPT,
          temperature: MINIMAX_TEMPERATURE,
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
          userId,
          provider: settings.provider,
          model: settings.synthesisModel,
          maxTokens: settings.maxTokens,
          system: MINIMAX_SYSTEM_PROMPT,
          temperature: MINIMAX_TEMPERATURE,
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
}

export type CreateSynthesizerOptions = {
  /**
   * Owner of the request. Stamped on every `app_log` row this synthesizer
   * emits so the user-facing "My logs" page can filter by it.
   */
  userId?: string;
};

export function createSynthesizer(
  settings: ResolvedSynthesisSettings,
  options?: CreateSynthesizerOptions,
): Synthesizer {
  assertSynthesisBudget(settings);
  if (settings.provider !== "minimax") {
    throw new Error(`Unsupported synthesis provider: ${settings.provider}`);
  }
  const userId =
    typeof options?.userId === "string" && options.userId.trim() !== ""
      ? options.userId
      : null;
  return withSynthesisLogging(
    createMinimaxSynthesizer(settings),
    settings,
    userId,
  );
}
