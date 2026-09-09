/**
 * DAL for the model-providers business: owns `app_model_provider_config`.
 *
 * Each provider's saved connection is an opaque per-provider JSON payload.
 * Allowed keys/kinds are declared by the provider's `connectionFields`
 * (see `catalog.ts`); the DAL stores payloads as-is after validating them.
 */

import { Prisma } from "../../../generated/prisma/client.ts";
import { getPrisma } from "../../../shared/db.ts";
import {
  allModels,
  type ProviderConnection,
  validateProviderConnection,
} from "./providers/catalog.ts";

export type { ProviderConnection };

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

function asConnectionMap(raw: unknown): Record<string, ProviderConnection> {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return {};
  const map: Record<string, ProviderConnection> = {};
  for (const [providerId, value] of Object.entries(
    raw as Record<string, unknown>,
  )) {
    if (value == null || typeof value !== "object" || Array.isArray(value)) {
      continue;
    }
    map[providerId] = value as ProviderConnection;
  }
  return map;
}

/** True when a payload is meant to clear the provider (empty or all-null). */
function isClearPayload(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value !== "object" || Array.isArray(value)) return false;
  const entries = Object.values(value as Record<string, unknown>);
  return entries.length === 0 || entries.every((v) => v == null);
}

/** Full content of `app_model_provider_config` (id `"default"`), or null. */
export async function loadConfigByModelProviderId(): Promise<ModelProviderConfigRow | null>;
/** Saved connection payload for `providerId`, or null when absent. */
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
  const value = map[providerId];
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as ProviderConnection;
}

/** Every saved per-provider connection payload, keyed by `providerId`. */
export async function loadProviderConnections(): Promise<
  Record<string, ProviderConnection>
> {
  const row = await getPrisma().appModelProviderConfig.findUnique({
    where: { id: CONFIG_ID },
  });
  return asConnectionMap(row?.providerConnections);
}

/**
 * Persist (partial) per-provider connections. `null` (or an empty/all-null
 * payload) deletes a provider's entry; other payloads are validated against
 * the provider's declared `connectionFields` before storing. Writes only
 * the `app_model_provider_config` row.
 */
export async function saveProviderConnections(
  input: Record<string, unknown> | undefined,
): Promise<Record<string, ProviderConnection>> {
  const merged = await loadProviderConnections();
  if (input) {
    for (const [providerId, raw] of Object.entries(input)) {
      if (isClearPayload(raw)) {
        delete merged[providerId];
        continue;
      }
      const check = validateProviderConnection(providerId, raw);
      if (!check.ok) {
        throw new Error(`${providerId}: ${check.error}`);
      }
      merged[providerId] = check.connection;
    }
  }
  await getPrisma().appModelProviderConfig.upsert({
    where: { id: CONFIG_ID },
    create: {
      id: CONFIG_ID,
      providerConnections: merged as unknown as Prisma.InputJsonValue,
    },
    update: {
      providerConnections: merged as unknown as Prisma.InputJsonValue,
    },
  });
  return merged;
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
