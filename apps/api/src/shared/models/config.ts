/**
 * DB-backed model registry (`app_model_config`).
 *
 * Single row, id = `"default"`. Two JSON columns:
 *   - `connections` — `Record<modelId, ModelConnection>`.
 *   - `tasks`       — `{ embedding, llm, vision }` modelId-or-null.
 *
 * `loadModelConfig` reads and validates the JSON, returning a fully
 * typed `ModelConfig`. `saveModelConfig` accepts the same shape but
 * runs two sanity passes before persisting:
 *   - Drop any `connections` entry that's empty (no fields set).
 *   - Auto-null any `tasks[task]` whose target is not fully configured.
 */

import { Prisma } from "../../generated/prisma/client.ts";
import { getPrisma } from "../db.ts";
import { getModelById } from "./catalog.ts";
import { getProviderById } from "./providers.ts";
import type {
  CapabilityTag,
  ModelConfig,
  ModelConnection,
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

function readConnection(value: unknown): ModelConnection | null {
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

function isConnectionEmpty(conn: ModelConnection): boolean {
  return (
    (conn.apiKey ?? null) === null &&
    (conn.baseUrl ?? null) === null &&
    (conn.port ?? null) === null
  );
}

function normalizeConnection(conn: ModelConnection): ModelConnection {
  return {
    apiKey: conn.apiKey ?? null,
    baseUrl: conn.baseUrl ?? null,
    port: conn.port ?? null,
  };
}

function isFullyConfigured(
  conn: ModelConnection,
  modelId: string,
): { ok: true } | { ok: false; missing: string } {
  const model = getModelById(modelId);
  const provider = model ? getProviderById(model.providerId) : null;
  if (!model || !provider) return { ok: false, missing: "catalog" };
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
  const row = await getPrisma().appModelConfig.findUnique({
    where: { id: CONFIG_ID },
  });
  return parseModelConfig(row);
}

export function parseModelConfig(
  row:
    | { connections: Prisma.JsonValue | null; tasks: Prisma.JsonValue | null }
    | null
    | undefined,
): ModelConfig {
  const connsRaw = readJsonField(row?.connections ?? null);
  const tasksRaw = readJsonField(row?.tasks ?? null);

  const connections: Record<string, ModelConnection> = {};
  for (const [modelId, raw] of Object.entries(connsRaw)) {
    const conn = readConnection(raw);
    if (!conn || isConnectionEmpty(conn)) continue;
    connections[modelId] = normalizeConnection(conn);
  }

  const pickTask = (key: string): string | null => {
    const v = tasksRaw[key];
    return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
  };

  return {
    connections,
    tasks: {
      embedding: pickTask("embedding"),
      llm: pickTask("llm"),
      vision: pickTask("vision"),
    },
  };
}

/**
 * Returns the model ids in `config.connections` that are fully
 * configured (every provider-declared field is filled). Used to filter
 * task dropdowns so broken entries never reach the routing layer.
 */
export function fullyConfiguredModelIds(config: ModelConfig): string[] {
  const ids: string[] = [];
  for (const [modelId, conn] of Object.entries(config.connections)) {
    if (isFullyConfigured(conn, modelId).ok) ids.push(modelId);
  }
  return ids;
}

export type SaveModelConfigInput = {
  connections?: Record<string, ModelConnection | null | undefined>;
  tasks?: Partial<ModelConfig["tasks"]>;
};

/**
 * Persist `connections` + `tasks`. Empty connection entries are
 * dropped; any `tasks[task]` whose target is no longer fully
 * configured is auto-nulled before write.
 */
export async function saveModelConfig(
  input: SaveModelConfigInput,
): Promise<ModelConfig> {
  const existing = await loadModelConfig();

  // Merge connections — accept partial updates; keep unspecified entries.
  const mergedConns: Record<string, ModelConnection> = {
    ...existing.connections,
  };
  if (input.connections) {
    for (const [modelId, raw] of Object.entries(input.connections)) {
      if (raw == null) {
        delete mergedConns[modelId];
      } else {
        const conn = normalizeConnection(raw);
        if (isConnectionEmpty(conn)) {
          delete mergedConns[modelId];
        } else {
          mergedConns[modelId] = conn;
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
    const id = mergedTasks[tag];
    if (id == null) continue;
    const conn = mergedConns[id];
    if (!conn || !isFullyConfigured(conn, id).ok) {
      mergedTasks[tag] = null;
    }
  }

  const json = Prisma.JsonNull;
  void json; // (kept for parity with prior version)

  await getPrisma().appModelConfig.upsert({
    where: { id: CONFIG_ID },
    create: {
      id: CONFIG_ID,
      connections: mergedConns as unknown as Prisma.InputJsonValue,
      tasks: mergedTasks as unknown as Prisma.InputJsonValue,
    },
    update: {
      connections: mergedConns as unknown as Prisma.InputJsonValue,
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
 * Resolve a task to a `(Model, Provider, Connection)` triple. Throws a
 * descriptive `Error` when the task is unset, the model id is unknown,
 * the provider id is unknown, the model doesn't declare the requested
 * capability, or the connection is not fully configured.
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
  const connection = config.connections[modelId];
  if (!connection) {
    throw new Error(
      `Task ${task} points at ${modelId} but it has no saved connection. Configure it under Providers.`,
    );
  }
  const check = isFullyConfigured(connection, modelId);
  if (!check.ok) {
    throw new Error(
      `Task ${task} model ${modelId} is missing ${check.missing}. Finish configuration under Providers.`,
    );
  }
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
  return { task, connection, model, provider };
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export { isFullyConfigured };
