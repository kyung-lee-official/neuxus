/**
 * DAL for `app_model_provider_config` — a pure middle layer for provider
 * connections. Reads a provider's payload (or the whole map) and persists
 * writes through a serialized read→recompose→write. No registry logic.
 */

import { Prisma } from "../../../generated/prisma/client.ts";
import { getPrisma } from "../../../shared/db.ts";
import {
  type ProviderConnection,
  validateProviderConnection,
} from "./providers/catalog.ts";

const CONFIG_ID = "default";

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

/** Every saved per-provider connection payload, keyed by `providerId`. */
export async function loadProviderConnections(): Promise<
  Record<string, ProviderConnection>
> {
  const row = await getPrisma().appModelProviderConfig.findUnique({
    where: { id: CONFIG_ID },
  });
  return asConnectionMap(row?.providerConnections);
}

/** The saved connection payload for one provider, or null. */
export async function loadProviderConnection(
  providerId: string,
): Promise<ProviderConnection | null> {
  const map = await loadProviderConnections();
  return map[providerId] ?? null;
}

/**
 * Serializes all writes on this process. Single Bun process → a
 * promise-chain lock is enough to make read→modify→write safe against
 * concurrent requests.
 */
let writeLock: Promise<void> = Promise.resolve();

function locked<T>(fn: () => Promise<T>): Promise<T> {
  const run = writeLock.then(fn, fn);
  writeLock = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/**
 * Core read→recompose→write: load the full row, apply the partial input
 * (validating each payload), then write the row once.
 */
async function mutateProviderConnections(
  input: Record<string, unknown>,
): Promise<Record<string, ProviderConnection>> {
  const merged = await loadProviderConnections();
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
 * Persist (partial) per-provider connections under an in-process write
 * lock. `null` (or an empty/all-null payload) deletes a provider's entry.
 */
export function saveProviderConnections(
  input: Record<string, unknown> | undefined,
): Promise<Record<string, ProviderConnection>> {
  return locked(async () => mutateProviderConnections(input ?? {}));
}

/** Persist one provider's connection payload under the same write lock. */
export function saveProviderConnection(
  providerId: string,
  raw: unknown,
): Promise<ProviderConnection> {
  return locked(async () => {
    const merged = await mutateProviderConnections({ [providerId]: raw });
    const conn = merged[providerId];
    if (!conn) {
      throw new Error(`No connection stored for provider: ${providerId}`);
    }
    return conn;
  });
}
