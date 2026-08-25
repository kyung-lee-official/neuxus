/** App-level defaults for synthesis settings (DB may override). */

export const SYNTHESIS_DEFAULTS = {
  provider: "minimax",
  synthesisModel: "MiniMax-M3",
  baseUrl: "https://api.minimaxi.com/anthropic",
  apiKey: null as string | null,
  maxTokens: 4096,
  contextWindowTokens: 1_000_000,
} as const;

export type SynthesisSettingsRow = {
  provider?: string | null;
  synthesisModel?: string | null;
  baseUrl?: string | null;
  apiKey?: string | null;
  maxTokens?: number | null;
  contextWindowTokens?: number | null;
};

export type ResolvedSynthesisSettings = {
  provider: string;
  synthesisModel: string;
  baseUrl: string;
  apiKey: string | null;
  maxTokens: number;
  contextWindowTokens: number;
};

export type StoredSynthesisSettings = {
  provider: string | null;
  synthesisModel: string | null;
  baseUrl: string | null;
  apiKey: string | null;
  maxTokens: number | null;
  contextWindowTokens: number | null;
};

function nonEmpty(value: string | null | undefined): string | undefined {
  if (value == null) return undefined;
  const t = value.trim();
  return t === "" ? undefined : t;
}

function positiveInt(value: number | null | undefined): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : undefined;
}

/** Dev/CI convenience: read `MINIMAX_API_KEY` from process env. */
function apiKeyFromEnv(): string | undefined {
  return nonEmpty(process.env.MINIMAX_API_KEY);
}

export function storedSynthesisSettings(
  row?: SynthesisSettingsRow | null,
): StoredSynthesisSettings {
  return {
    provider: nonEmpty(row?.provider) ?? null,
    synthesisModel: nonEmpty(row?.synthesisModel) ?? null,
    baseUrl: nonEmpty(row?.baseUrl) ?? null,
    apiKey: nonEmpty(row?.apiKey) ?? null,
    maxTokens: positiveInt(row?.maxTokens) ?? null,
    contextWindowTokens: positiveInt(row?.contextWindowTokens) ?? null,
  };
}

export function resolveSynthesisSettings(
  row?: SynthesisSettingsRow | null,
): ResolvedSynthesisSettings {
  const synthesisModel =
    nonEmpty(row?.synthesisModel) ?? SYNTHESIS_DEFAULTS.synthesisModel;
  const contextFromRow = positiveInt(row?.contextWindowTokens);
  const contextWindowTokens =
    contextFromRow ??
    (synthesisModel === SYNTHESIS_DEFAULTS.synthesisModel
      ? SYNTHESIS_DEFAULTS.contextWindowTokens
      : 0);

  return {
    provider: nonEmpty(row?.provider) ?? SYNTHESIS_DEFAULTS.provider,
    synthesisModel,
    baseUrl: (nonEmpty(row?.baseUrl) ?? SYNTHESIS_DEFAULTS.baseUrl).replace(
      /\/$/,
      "",
    ),
    apiKey:
      nonEmpty(row?.apiKey) ?? apiKeyFromEnv() ?? SYNTHESIS_DEFAULTS.apiKey,
    maxTokens: positiveInt(row?.maxTokens) ?? SYNTHESIS_DEFAULTS.maxTokens,
    contextWindowTokens,
  };
}

/** Refuse to call the provider when the window is unknown or cannot hold `max_tokens`. */
export function assertSynthesisBudget(
  settings: ResolvedSynthesisSettings,
): void {
  if (settings.contextWindowTokens < 1) {
    throw new Error(
      `context_window_tokens is required for synthesis_model ${settings.synthesisModel}`,
    );
  }
  if (settings.maxTokens < 1) {
    throw new Error("max_tokens must be a positive integer");
  }
  if (settings.maxTokens >= settings.contextWindowTokens) {
    throw new Error("max_tokens does not fit in context_window_tokens");
  }
}
