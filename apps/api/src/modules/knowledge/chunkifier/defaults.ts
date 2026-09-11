/** App-level defaults for chunkify knobs (DB may override later). */

export const CHUNKIFY_DEFAULTS = {
  childTargetTokens: 400,
  childHardMaxTokens: 500,
  childOverlapTokens: 60,
  childCrumbMinTokens: 64,
  parentMaxTokens: 1400,
  fenceIntroGlueMaxTokens: 40,
  /** ai-tokenizer encoding id — v1 picks o200k_base. */
  tokenizerEncoding: "o200k_base" as const,
} as const;

export type ChunkifyDefaults = typeof CHUNKIFY_DEFAULTS;

export type ChunkifyOptions = {
  childTargetTokens?: number;
  childHardMaxTokens?: number;
  childOverlapTokens?: number;
  childCrumbMinTokens?: number;
  parentMaxTokens?: number;
  fenceIntroGlueMaxTokens?: number;
  tokenizerEncoding?: string;
};

export type ResolvedChunkifyOptions = {
  childTargetTokens: number;
  childHardMaxTokens: number;
  childOverlapTokens: number;
  childCrumbMinTokens: number;
  parentMaxTokens: number;
  fenceIntroGlueMaxTokens: number;
  tokenizerEncoding: string;
};

export function resolveChunkifyOptions(
  options?: ChunkifyOptions,
): ResolvedChunkifyOptions {
  return {
    childTargetTokens:
      options?.childTargetTokens ?? CHUNKIFY_DEFAULTS.childTargetTokens,
    childHardMaxTokens:
      options?.childHardMaxTokens ?? CHUNKIFY_DEFAULTS.childHardMaxTokens,
    childOverlapTokens:
      options?.childOverlapTokens ?? CHUNKIFY_DEFAULTS.childOverlapTokens,
    childCrumbMinTokens:
      options?.childCrumbMinTokens ?? CHUNKIFY_DEFAULTS.childCrumbMinTokens,
    parentMaxTokens:
      options?.parentMaxTokens ?? CHUNKIFY_DEFAULTS.parentMaxTokens,
    fenceIntroGlueMaxTokens:
      options?.fenceIntroGlueMaxTokens ??
      CHUNKIFY_DEFAULTS.fenceIntroGlueMaxTokens,
    tokenizerEncoding:
      options?.tokenizerEncoding ?? CHUNKIFY_DEFAULTS.tokenizerEncoding,
  };
}
