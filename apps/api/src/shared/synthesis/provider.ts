import {
  assertSynthesisBudget,
  type ResolvedSynthesisSettings,
} from "./defaults.ts";
import { createMinimaxSynthesizer } from "./minimax.ts";
import type { Synthesizer } from "./types.ts";

export function createSynthesizer(
  settings: ResolvedSynthesisSettings,
): Synthesizer {
  assertSynthesisBudget(settings);
  if (settings.provider !== "minimax") {
    throw new Error(`Unsupported synthesis provider: ${settings.provider}`);
  }
  return createMinimaxSynthesizer(settings);
}
