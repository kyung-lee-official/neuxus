/**
 * Model catalog: aggregates the self-contained provider singletons under
 * `providers/`. Each provider owns its models, connection type, and
 * validation; this module composes them and offers flat lookups.
 */

import type { CapabilityTag, Model, ProviderModel } from "../types.ts";
import { type DeepSeekConnection, provider as deepseek } from "./deepseek.ts";
import {
  type MinimaxDefaultConnection,
  provider as minimaxDefault,
} from "./minimax-default.ts";
import {
  type MinimaxTokenPlanConnection,
  provider as minimaxTokenPlan,
} from "./minimax-token-plan.ts";
import { type OllamaConnection, provider as ollama } from "./ollama.ts";

/** Any concrete provider singleton — exposes `validateConnection`. */
export type AnyProvider =
  | typeof minimaxDefault
  | typeof minimaxTokenPlan
  | typeof deepseek
  | typeof ollama;

export const PROVIDERS: readonly AnyProvider[] = [
  minimaxDefault,
  minimaxTokenPlan,
  deepseek,
  ollama,
];

/** Saved connection payload for one provider — union of each provider's own type. */
export type ProviderConnection =
  | MinimaxDefaultConnection
  | MinimaxTokenPlanConnection
  | DeepSeekConnection
  | OllamaConnection;

export function getProviderById(id: string): AnyProvider | null {
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

/** Find a model by its `(providerId, modelId)` pair. */
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

/**
 * Validate a raw payload against the named provider's own connection type.
 * Dispatches through the provider instance (no central switch).
 */
export function validateProviderConnection(
  providerId: string,
  value: unknown,
): { ok: true; connection: ProviderConnection } | { ok: false; error: string } {
  const provider = getProviderById(providerId);
  if (!provider) {
    return { ok: false, error: `Unknown provider: ${providerId}` };
  }
  return provider.validateConnection(value);
}
