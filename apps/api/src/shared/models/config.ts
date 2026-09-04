/**
 * DB-backed model registry (`app_model_provider_config`).
 *
 * Single row, id = `"default"`. Two JSON columns:
 *   - `providerConnections` — `Record<providerId, ProviderConnection>`.
 *     Connection settings are provider-level, not per-model — every
 *     model under one provider shares the same key, base URL, and port.
 *   - `tasks`               — `{ embedding, llm, vision }` modelId-or-null.
 *
 * `loadModelConfig` reads and validates the JSON, returning a fully
 * typed `ModelConfig`. `saveModelConfig` accepts the same shape but
 * runs two sanity passes before persisting:
 *   - Drop any `providerConnections` entry that's empty (no fields set).
 *   - Auto-null any `tasks[task]` whose target's provider isn't fully
 *     configured.
 */

import { Prisma } from "../../generated/prisma/client.ts";
import { getPrisma } from "../db.ts";
import { getModelById } from "./catalog.ts";
import { resolveConnection } from "./connection.ts";
import { getProviderById } from "./providers.ts";
import type {
  CapabilityTag,
  ModelConfig,
  ProviderConnection,
  ResolvedModel,
} from "./types.ts";

const CONFIG_ID = "default";

function blankToNull(value: string | null | undefined): string | null {
  if (value == null) return null;
  const t = value.trim();
  return t === "" ? null : t;
}

function portOrNull(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : null;
}

function readProviderConnection(value: unknown): ProviderConnection | null {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const v = value as Record<string, unknown>;
  return {
    apiKey: blankToNull(v.apiKey as string | null | undefined),
    baseUrl: blankToNull(v.baseUrl as string | null | undefined),
    port: portOrNull(v.port as number | null | undefined),
  };
}

function isProviderConnectionEmpty(conn: ProviderConnection): boolean {
  return (
    (conn.apiKey ?? null) === null &&
    (conn.baseUrl ?? null) === null &&
    (conn.port ?? null) === null
  );
}

function normalizeProviderConnection(
  conn: ProviderConnection,
): ProviderConnection {
  return {
    apiKey: conn.apiKey ?? null,
    baseUrl: conn.baseUrl ?? null,
    port: conn.port ?? null,
  };
}

function isFullyConfigured(
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

function readJsonField(
  raw: Prisma.JsonValue | null | undefined,
): Record<string, unknown> {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as Record<string, unknown>;
}

export async function loadModelConfig(): Promise<ModelConfig> {
  const row = await getPrisma().appModelProviderConfig.findUnique({
    where: { id: CONFIG_ID },
  });
  return parseModelConfig(row);
}

export function parseModelConfig(
  row:
    | {
        providerConnections: Prisma.JsonValue | null;
        tasks: Prisma.JsonValue | null;
      }
    | null
    | undefined,
): ModelConfig {
  const connsRaw = readJsonField(row?.providerConnections ?? null);
  const tasksRaw = readJsonField(row?.tasks ?? null);

  const providerConnections: Record<string, ProviderConnection> = {};
  for (const [providerId, raw] of Object.entries(connsRaw)) {
    const conn = readProviderConnection(raw);
    if (!conn || isProviderConnectionEmpty(conn)) continue;
    providerConnections[providerId] = normalizeProviderConnection(conn);
  }

  const pickTask = (key: string): string | null => {
    const v = tasksRaw[key];
    return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
  };

  return {
    providerConnections,
    tasks: {
      embedding: pickTask("embedding"),
      llm: pickTask("llm"),
      vision: pickTask("vision"),
    },
  };
}

/**
 * Returns the provider ids in `config.providerConnections` that are
 * fully configured (every provider-declared field is filled). Used to
 * filter task dropdowns so broken entries never reach the routing layer.
 */
export function fullyConfiguredProviderIds(config: ModelConfig): string[] {
  const ids: string[] = [];
  for (const [providerId, conn] of Object.entries(config.providerConnections)) {
    if (isFullyConfigured(conn, providerId).ok) ids.push(providerId);
  }
  return ids;
}

export type SaveModelConfigInput = {
  providerConnections?: Record<string, ProviderConnection | null | undefined>;
  tasks?: Partial<ModelConfig["tasks"]>;
};

/**
 * Persist `providerConnections` + `tasks`. Empty connection entries are
 * dropped; any `tasks[task]` whose target's provider is no longer fully
 * configured is auto-nulled before write.
 */
export async function saveModelConfig(
  input: SaveModelConfigInput,
): Promise<ModelConfig> {
  const existing = await loadModelConfig();

  // Merge provider connections — accept partial updates; keep unspecified entries.
  const mergedConns: Record<string, ProviderConnection> = {
    ...existing.providerConnections,
  };
  if (input.providerConnections) {
    for (const [providerId, raw] of Object.entries(input.providerConnections)) {
      if (raw == null) {
        delete mergedConns[providerId];
      } else {
        const conn = normalizeProviderConnection(raw);
        if (isProviderConnectionEmpty(conn)) {
          delete mergedConns[providerId];
        } else {
          mergedConns[providerId] = conn;
        }
      }
    }
  }

  // Merge tasks — accept partial updates; validate against the merged set.
  const mergedTasks: ModelConfig["tasks"] = {
    ...existing.tasks,
    ...(input.tasks ?? {}),
  };
  for (const tag of ["embedding", "llm", "vision"] as const) {
    const modelId = mergedTasks[tag];
    if (modelId == null) continue;
    const model = getModelById(modelId);
    if (!model) {
      mergedTasks[tag] = null;
      continue;
    }
    const conn = mergedConns[model.providerId];
    if (!conn || !isFullyConfigured(conn, model.providerId).ok) {
      mergedTasks[tag] = null;
    }
  }

  await getPrisma().appModelProviderConfig.upsert({
    where: { id: CONFIG_ID },
    create: {
      id: CONFIG_ID,
      providerConnections: mergedConns as unknown as Prisma.InputJsonValue,
      tasks: mergedTasks as unknown as Prisma.InputJsonValue,
    },
    update: {
      providerConnections: mergedConns as unknown as Prisma.InputJsonValue,
      tasks: mergedTasks as unknown as Prisma.InputJsonValue,
    },
  });

  return loadModelConfig();
}

export type ResolveModelError =
  | { kind: "not_configured" }
  | { kind: "unknown_model"; modelId: string }
  | { kind: "missing_provider"; providerId: string }
  | { kind: "missing_capability"; task: CapabilityTag };

/**
 * Shared resolution core: check `modelId` exists, is catalogued under a
 * known provider, declares the `task` capability, and the provider has a
 * fully-configured saved connection. Returns the `(Model, Provider,
 * ResolvedConnection)` triple.
 */
function resolveCapabilityModel(
  modelId: string,
  task: CapabilityTag,
  config: ModelConfig,
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
  if (model.capabilities[task] !== true) {
    throw new Error(`Model ${modelId} does not support ${task} capability`);
  }
  const rawConnection = config.providerConnections[provider.id];
  if (!rawConnection) {
    throw new Error(
      `Model ${modelId} provider ${provider.id} has no saved connection. Save one under Providers first.`,
    );
  }
  const check = isFullyConfigured(rawConnection, provider.id);
  if (!check.ok) {
    throw new Error(
      `Model ${modelId} provider ${provider.id} is missing ${check.missing}. Finish configuration under Providers first.`,
    );
  }
  const connection = resolveConnection(provider, rawConnection);
  return { task, connection, model, provider };
}

/**
 * Resolve the model assigned to `task` to a `(Model, Provider,
 * ResolvedConnection)` triple. Throws a descriptive `Error` when the
 * task is unset, the model id is unknown, the provider id is unknown,
 * the model doesn't declare the requested capability, or the provider's
 * connection is not fully configured.
 */
export function resolveModel(
  task: CapabilityTag,
  config: ModelConfig,
): ResolvedModel {
  const modelId = config.tasks[task];
  if (!modelId) {
    throw new Error(
      `No model assigned to ${task}. Configure one under Server settings → ${capitalize(task)} first.`,
    );
  }
  return resolveCapabilityModel(modelId, task, config);
}

/**
 * Resolve an explicit catalog model id for `task` — same capability and
 * connection checks as `resolveModel`, but without needing a task
 * assignment. Lets a caller (e.g. the per-model "Test embed" button)
 * exercise a specific model over its provider's saved connection.
 */
export function resolveModelByModelId(
  modelId: string,
  task: CapabilityTag,
  config: ModelConfig,
): ResolvedModel {
  return resolveCapabilityModel(modelId, task, config);
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export { isFullyConfigured };
