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
): Synthesizer {
  return {
    async synthesize(prompt: string): Promise<string> {
      const request = buildMinimaxRequestBody(settings, prompt);
      const start = performance.now();
      try {
        const response = await inner.synthesize(prompt);
        synthesisLog.info("synthesis ok", {
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

export function createSynthesizer(
  settings: ResolvedSynthesisSettings,
): Synthesizer {
  assertSynthesisBudget(settings);
  if (settings.provider !== "minimax") {
    throw new Error(`Unsupported synthesis provider: ${settings.provider}`);
  }
  return withSynthesisLogging(createMinimaxSynthesizer(settings), settings);
}
