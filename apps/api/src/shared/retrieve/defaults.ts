/** App-level defaults for query retrieve knobs. */

export const RETRIEVE_DEFAULTS = {
  /** Child rows from cosine search before parent dedupe. */
  childLimit: 24,
  maxParents: 8,
  maxCharacters: 12_000,
} as const;

export type RetrieveOptions = {
  childLimit?: number;
  maxParents?: number;
  maxCharacters?: number;
};

export type ResolvedRetrieveOptions = {
  childLimit: number;
  maxParents: number;
  maxCharacters: number;
};

function positiveInt(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : fallback;
}

export function resolveRetrieveOptions(
  options?: RetrieveOptions,
): ResolvedRetrieveOptions {
  return {
    childLimit: positiveInt(options?.childLimit, RETRIEVE_DEFAULTS.childLimit),
    maxParents: positiveInt(options?.maxParents, RETRIEVE_DEFAULTS.maxParents),
    maxCharacters: positiveInt(
      options?.maxCharacters,
      RETRIEVE_DEFAULTS.maxCharacters,
    ),
  };
}
