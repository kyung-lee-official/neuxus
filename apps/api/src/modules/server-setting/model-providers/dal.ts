/**
 * DAL for the model-providers business: direct access to the
 * `app_model_provider_config` singleton row.
 *
 * Without a provider id: returns the whole row (id `"default"` + raw
 * `providerConnections`). With a provider id: returns that provider's
 * saved connection parsed from the JSON (or `null` when absent).
 */

import { getPrisma } from "../../../shared/db.ts";
import { allModels } from "./models/catalog.ts";
import type { CapabilityTag, Model } from "./types.ts";

/** Canonical capability tags — single source; use these, not literals. */
export const CAPABILITY_EMBEDDING = "embedding";
export const CAPABILITY_TEXT = "text";
export const CAPABILITY_VISION = "vision";

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
 * Catalog models that declare **all** the given capability tags. Pure
 * registry query — no provider connections or config involved.
 */
export function resolveCapabilityModel(
  tags: readonly CapabilityTag[],
): Model[] {
  return allModels().filter((model) =>
    tags.every((tag) => model.capabilities[tag] === true),
  );
}
