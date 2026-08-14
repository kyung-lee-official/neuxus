export {
  type EmbedChildRow,
  type EmbedChildRowsResult,
  type EmbedStaleChildrenOptions,
  type EmbedStaleChildrenResult,
  embedChildRows,
  embedStaleChildren,
  pgvectorLiteral,
} from "./children.ts";
export {
  EMBED_DEFAULTS,
  type EmbedSettingsRow,
  type ResolvedEmbedSettings,
  resolveEmbedSettings,
} from "./defaults.ts";
export { createOllamaEmbedder } from "./ollama.ts";
export { createEmbedder } from "./provider.ts";
export { loadEmbedSettings, saveEmbedSettings } from "./settings.ts";
export type { Embedder } from "./types.ts";
