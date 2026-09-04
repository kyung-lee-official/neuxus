/**
 * Model catalog.
 *
 * Single source of truth for every supported model. The admin UI renders
 * the dropdown from `MODELS` (filtered by capability); the routing layer
 * (`routing.ts`) resolves a `ModelSlot` from `app_model_config` to a
 * `(Model, Provider)` pair via this catalog.
 *
 * To add a new model:
 *   1. Add a `Provider` entry in `providers.ts` if its wire format is new.
 *   2. Add a `Model` entry below.
 *   3. (Optionally) update the admin dropdown grouping in
 *      `server-settings-panel.tsx`.
 */

import type { CapabilityTag, Model } from "./types.ts";

export const MODELS: readonly Model[] = [
  {
    id: "minimax-m3",
    providerId: "minimax-default",
    displayName: "MiniMax-M3",
    capabilities: { llm: true, vision: true },
    defaults: {
      contextWindowTokens: 1_000_000,
      maxOutputTokens: 4096,
      temperature: 1,
    },
  },
  {
    id: "minimax-m3-token-plan",
    providerId: "minimax-token-plan",
    displayName: "MiniMax-M3 (Token Plan)",
    capabilities: { llm: true, vision: true },
    defaults: {
      contextWindowTokens: 1_000_000,
      maxOutputTokens: 4096,
      temperature: 1,
    },
  },
  {
    id: "deepseek-v4-flash",
    providerId: "deepseek",
    displayName: "DeepSeek V4 Flash",
    capabilities: { llm: true },
    defaults: {
      contextWindowTokens: 128_000,
      maxOutputTokens: 8192,
    },
  },
  {
    id: "deepseek-v4-pro",
    providerId: "deepseek",
    displayName: "DeepSeek V4 Pro",
    capabilities: { llm: true },
    defaults: {
      contextWindowTokens: 128_000,
      maxOutputTokens: 8192,
    },
  },
  {
    id: "deepseek-v4-flash-vision-exp",
    providerId: "deepseek",
    displayName: "DeepSeek V4 Flash Vision (Experimental)",
    capabilities: { llm: true, vision: true },
    defaults: {
      contextWindowTokens: 128_000,
      maxOutputTokens: 8192,
    },
  },
  {
    id: "nomic-embed-text",
    providerId: "ollama",
    displayName: "nomic-embed-text:latest",
    capabilities: { embedding: true },
    defaults: { embeddingDimensions: 768 },
  },
] as const;

export function getModelById(id: string): Model | null {
  return MODELS.find((m) => m.id === id) ?? null;
}

export function getModelsByCapability(tag: CapabilityTag): Model[] {
  return MODELS.filter((m) => m.capabilities[tag] === true);
}
