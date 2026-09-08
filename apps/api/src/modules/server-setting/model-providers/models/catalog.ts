/**
 * Single source of truth for the model catalog: providers with their
 * models nested underneath. Model identity is scoped by provider — the
 * same model id may exist under different providers.
 *
 * The admin UI renders the provider list from `PROVIDERS`; flat helpers
 * (`allModels`, `getModel`, `getModelsByCapability`) feed consumers that
 * need provider-independent views (APIs, diagnostics, dropdowns).
 */

import type {
  CapabilityTag,
  Model,
  Provider,
  ProviderConnection,
  ProviderModel,
} from "../types.ts";

export const ANTHROPIC_VERSION = "2023-06-01";

const anthropicHeaders = {
  "anthropic-version": ANTHROPIC_VERSION,
} as const;

export const PROVIDERS: readonly Provider[] = [
  {
    id: "minimax-default",
    displayName: "Minimax",
    baseUrl: "https://api.minimaxi.com/anthropic",
    requestShape: "anthropic-messages",
    headers: anthropicHeaders,
    userInputs: ["apiKey"],
    models: [
      {
        id: "MiniMax-M3",
        displayName: "MiniMax-M3",
        capabilities: { llm: true, vision: true },
        defaults: {
          contextWindowTokens: 1_000_000,
          maxOutputTokens: 4096,
          temperature: 1,
        },
      },
    ],
  },
  {
    id: "minimax-token-plan",
    displayName: "Minimax (Token Plan)",
    baseUrl: "https://api.minimaxi.com/anthropic/v1/token-plan",
    requestShape: "anthropic-messages",
    headers: anthropicHeaders,
    userInputs: ["apiKey"],
    models: [
      {
        id: "MiniMax-M3",
        displayName: "MiniMax-M3 (Token Plan)",
        capabilities: { llm: true, vision: true },
        defaults: {
          contextWindowTokens: 1_000_000,
          maxOutputTokens: 4096,
          temperature: 1,
        },
      },
    ],
  },
  {
    id: "deepseek",
    displayName: "DeepSeek",
    baseUrl: "https://api.deepseek.com/anthropic",
    requestShape: "anthropic-messages",
    headers: anthropicHeaders,
    userInputs: ["apiKey"],
    models: [
      {
        id: "deepseek-v4-flash",
        displayName: "DeepSeek V4 Flash",
        capabilities: { llm: true },
        defaults: {
          contextWindowTokens: 128_000,
          maxOutputTokens: 8192,
        },
      },
      {
        id: "deepseek-v4-pro",
        displayName: "DeepSeek V4 Pro",
        capabilities: { llm: true },
        defaults: {
          contextWindowTokens: 128_000,
          maxOutputTokens: 8192,
        },
      },
      {
        id: "deepseek-v4-flash-vision-exp",
        displayName: "DeepSeek V4 Flash Vision (Experimental)",
        capabilities: { llm: true, vision: true },
        defaults: {
          contextWindowTokens: 128_000,
          maxOutputTokens: 8192,
        },
      },
    ],
  },
  {
    id: "ollama",
    displayName: "Ollama (local)",
    baseUrl: "http://127.0.0.1:11434",
    requestShape: "ollama-embed",
    userInputs: ["baseUrl", "port"],
    models: [
      {
        id: "nomic-embed-text",
        displayName: "nomic-embed-text:latest",
        capabilities: { embedding: true },
        defaults: { embeddingDimensions: 768 },
      },
      {
        id: "embeddinggemma",
        displayName: "embeddinggemma:latest",
        capabilities: { embedding: true },
        defaults: { embeddingDimensions: 768 },
      },
    ],
  },
] as const;

export function getProviderById(id: string): Provider | null {
  return PROVIDERS.find((p) => p.id === id) ?? null;
}

/** Flat list of every model, with its owning `providerId` attached. */
export function allModels(): ProviderModel[] {
  const out: ProviderModel[] = [];
  for (const provider of PROVIDERS) {
    for (const model of provider.models) {
      out.push({ ...model, providerId: provider.id });
    }
  }
  return out;
}

/**
 * Find a model by its unique `(providerId, modelId)` pair — model ids are
 * only unique *within* a provider.
 */
export function getModel(providerId: string, modelId: string): Model | null {
  const provider = getProviderById(providerId);
  if (!provider) return null;
  return provider.models.find((m) => m.id === modelId) ?? null;
}

/** Flat models that declare **all** the given capability tags. */
export function getModelsByCapability(
  tags: readonly CapabilityTag[],
): ProviderModel[] {
  return allModels().filter((model) =>
    tags.every((tag) => model.capabilities[tag] === true),
  );
}

/** Whether `conn` fills every field the provider declares in `userInputs`. */
export function isFullyConfigured(
  conn: ProviderConnection,
  providerId: string,
): { ok: true } | { ok: false; missing: string } {
  const provider = getProviderById(providerId);
  if (!provider) return { ok: false, missing: "catalog" };
  for (const field of provider.userInputs) {
    if (field === "apiKey" && !conn.apiKey)
      return { ok: false, missing: "apiKey" };
    if (field === "baseUrl" && !conn.baseUrl)
      return { ok: false, missing: "baseUrl" };
    if (field === "port" && !conn.port) return { ok: false, missing: "port" };
  }
  return { ok: true };
}
