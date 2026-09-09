/**
 * Model catalog: aggregates the self-contained providers under
 * `providers/`. Each provider owns its models, connection type, and
 * validation; this module just composes them and offers flat lookups.
 */

import {
  type DeepSeekConnection,
  provider as deepseek,
  validateConnection as validateDeepSeek,
} from "./providers/deepseek.ts";
import {
  type MinimaxDefaultConnection,
  provider as minimaxDefault,
  validateConnection as validateMinimaxDefault,
} from "./providers/minimax-default.ts";
import {
  type MinimaxTokenPlanConnection,
  provider as minimaxTokenPlan,
  validateConnection as validateMinimaxTokenPlan,
} from "./providers/minimax-token-plan.ts";
import {
  type OllamaConnection,
  provider as ollama,
  validateConnection as validateOllama,
} from "./providers/ollama.ts";
import type { CapabilityTag, Model, Provider, ProviderModel } from "./types.ts";

export const PROVIDERS: readonly Provider[] = [
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

/** Validate a raw payload against the named provider's own connection type. */
export function validateProviderConnection(
  providerId: string,
  value: unknown,
): { ok: true; connection: ProviderConnection } | { ok: false; error: string } {
  switch (providerId) {
    case "minimax-default":
      return validateMinimaxDefault(value);
    case "minimax-token-plan":
      return validateMinimaxTokenPlan(value);
    case "deepseek":
      return validateDeepSeek(value);
    case "ollama":
      return validateOllama(value);
    default:
      return { ok: false, error: `Unknown provider: ${providerId}` };
  }
}
