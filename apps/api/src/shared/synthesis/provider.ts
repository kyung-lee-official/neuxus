import { childLogger } from "../log/index.ts";
import {
  assertSynthesisBudget,
  type ResolvedSynthesisSettings,
} from "./defaults.ts";
import { createMinimaxSynthesizer } from "./minimax.ts";
import type { Synthesizer } from "./types.ts";

const synthesisLog = childLogger({ module: "synthesis" }, "synthesis");

/**
 * Wrap a `Synthesizer` so every call logs the raw prompt sent to the
 * LLM, the response, latency, model, and outcome to the app logger.
 * Errors are rethrown after logging.
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
      const start = performance.now();
      try {
        const response = await inner.synthesize(prompt);
        synthesisLog.info("synthesis ok", {
          provider: settings.provider,
          model: settings.synthesisModel,
          maxTokens: settings.maxTokens,
          promptChars: prompt.length,
          prompt,
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
          promptChars: prompt.length,
          prompt,
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
