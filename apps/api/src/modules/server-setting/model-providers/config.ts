/**
 * Direct access to the `app_model_provider_config` singleton row for the
 * model-provider business.
 *
 * Without a provider id: returns the whole row (id `"default"` + raw
 * `providerConnections`). With a provider id: returns that provider's
 * saved connection parsed from the JSON (or `null` when absent).
 */

import { getPrisma } from "../../../shared/db.ts";
import { getModelById } from "../../../shared/models/catalog.ts";
import { isFullyConfigured } from "../../../shared/models/config.ts";
import { resolveConnection } from "../../../shared/models/connection.ts";
import { getProviderById } from "../../../shared/models/providers.ts";
import type {
  CapabilityTag,
  ResolvedModel,
} from "../../../shared/models/types.ts";

const CONFIG_ID = "default";

export type ModelProviderConfigRow = {
  id: string;
  providerConnections: unknown;
};

export type ProviderConnection = {
  apiKey: string | null;
  baseUrl: string | null;
  port: number | null;
};

function readConnection(value: unknown): ProviderConnection | null {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const v = value as Record<string, unknown>;
  return {
    apiKey:
      typeof v.apiKey === "string" && v.apiKey.trim() !== ""
        ? v.apiKey.trim()
        : null,
    baseUrl:
      typeof v.baseUrl === "string" && v.baseUrl.trim() !== ""
        ? v.baseUrl.trim()
        : null,
    port:
      typeof v.port === "number" && Number.isInteger(v.port) && v.port > 0
        ? v.port
        : null,
  };
}

/** Full content of `app_model_provider_config` (id `"default"`), or null. */
export async function loadConfigByModelProviderId(): Promise<ModelProviderConfigRow | null>;
/** Saved connection for `providerId`, parsed from the JSON, or null. */
export async function loadConfigByModelProviderId(
  providerId: string,
): Promise<ProviderConnection | null>;
export async function loadConfigByModelProviderId(
  providerId?: string,
): Promise<ModelProviderConfigRow | ProviderConnection | null> {
  const row = await getPrisma().appModelProviderConfig.findUnique({
    where: { id: CONFIG_ID },
  });

  if (providerId === undefined) {
    return row
      ? { id: row.id, providerConnections: row.providerConnections }
      : null;
  }

  if (
    row?.providerConnections == null ||
    typeof row.providerConnections !== "object" ||
    Array.isArray(row.providerConnections)
  ) {
    return null;
  }
  const map = row.providerConnections as Record<string, unknown>;
  return readConnection(map[providerId]);
}

/**
 * Shared resolution core: check `modelId` exists, is catalogued under a
 * known provider, declares the `capability`, and the provider has a
 * fully-configured saved connection. Returns the `(Model, Provider,
 * ResolvedConnection)` triple.
 */
export function resolveCapabilityModel(
  modelId: string,
  capability: CapabilityTag,
  connections: Record<string, ProviderConnection>,
): ResolvedModel {
  const model = getModelById(modelId);
  if (!model) {
    throw new Error(`Unknown model id: ${modelId}`);
  }
  const provider = getProviderById(model.providerId);
  if (!provider) {
    throw new Error(
      `Unknown provider id: ${model.providerId} (referenced by ${modelId})`,
    );
  }
  if (model.capabilities[capability] !== true) {
    throw new Error(
      `Model ${modelId} does not support ${capability} capability`,
    );
  }
  const rawConnection = connections[provider.id];
  if (!rawConnection) {
    throw new Error(
      `Model ${modelId} provider ${provider.id} has no saved connection. Save one under Server settings → Providers first.`,
    );
  }
  const check = isFullyConfigured(rawConnection, provider.id);
  if (!check.ok) {
    throw new Error(
      `Model ${modelId} provider ${provider.id} is missing ${check.missing}. Finish configuration under Server settings → Providers first.`,
    );
  }
  const connection = resolveConnection(provider, rawConnection);
  return { task: capability, connection, model, provider };
}
