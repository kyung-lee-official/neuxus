import type { ResolvedEmbedSettings } from "./defaults.ts";
import { createOllamaEmbedder } from "./ollama.ts";
import type { Embedder } from "./types.ts";

export function createEmbedder(settings: ResolvedEmbedSettings): Embedder {
  if (settings.provider !== "ollama") {
    throw new Error(`Unsupported embed provider: ${settings.provider}`);
  }
  return createOllamaEmbedder(settings);
}
