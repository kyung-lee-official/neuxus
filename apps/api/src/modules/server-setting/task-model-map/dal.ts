/**
 * DAL for the task-model-map business: reads/writes the singleton config rows
 * and owns the task definitions (ids + required capabilities).
 *
 *   - `app_model_provider_config.providerConnections` — raw per-provider
 *     connection overrides.
 *   - `app_model_task_config.tasks` — which catalog model serves each app
 *     task. Keys are `ModelTaskId`s.
 *
 * Both rows are keyed `"default"` and are updated together in one
 * transaction.
 */

import { Prisma } from "../../../generated/prisma/client.ts";
import { getPrisma } from "../../../shared/db.ts";
import {
  CAPABILITY_EMBEDDING,
  CAPABILITY_TEXT,
  CAPABILITY_VISION,
} from "../model-providers/dal.ts";
import {
  getProviderById,
  isFullyConfigured,
} from "../model-providers/models/catalog.ts";
import type {
  CapabilityTag,
  ProviderConnection,
} from "../model-providers/types.ts";
import type { ModelTaskId } from "./type.ts";

const CONFIG_ID = "default";

/** Canonical task ids — single source of truth. */
export const TASK_EMBEDDING = "embedding";
export const TASK_TEXT_SYNTHESIS = "text-synthesis";
export const TASK_MD_IMAGE_CAPTIONING = "md-image-captioning";

/** Task definitions: id + the capabilities it requires. */
export const MODEL_TASKS = [
  { id: TASK_EMBEDDING, requiredCapabilities: [CAPABILITY_EMBEDDING] },
  { id: TASK_TEXT_SYNTHESIS, requiredCapabilities: [CAPABILITY_TEXT] },
  {
    id: TASK_MD_IMAGE_CAPTIONING,
    // Describing images is generation over image input: text + vision.
    requiredCapabilities: [CAPABILITY_TEXT, CAPABILITY_VISION],
  },
] as const;

/** Id list, derived from `MODEL_TASKS` — not a second definition. */
export const MODEL_TASK_IDS = [
  TASK_EMBEDDING,
  TASK_TEXT_SYNTHESIS,
  TASK_MD_IMAGE_CAPTIONING,
] as const;

/** Capabilities a model must declare to serve `taskId`. */
export function requiredCapabilitiesByTask(
  taskId: ModelTaskId,
): readonly CapabilityTag[] {
  const task = MODEL_TASKS.find((t) => t.id === taskId);
  if (!task) {
    throw new Error(`Unknown task id: ${taskId}`);
  }
  return task.requiredCapabilities;
}

/** Narrow a runtime value to a known task id (e.g. parsed JSON keys). */
export function isModelTaskId(value: unknown): value is ModelTaskId {
  return MODEL_TASK_IDS.some((id) => id === value);
}

export type TaskAssignments = Record<ModelTaskId, string | null>;

export type ModelConfig = {
  /** Keyed by catalog `providerId`. Empty object when nothing configured. */
  providerConnections: Record<string, ProviderConnection>;
  /** Active catalog `modelId` per app task, or null. */
  tasks: TaskAssignments;
};

export type SaveModelConfigInput = {
  providerConnections?: Record<string, ProviderConnection | null | undefined>;
  tasks?: Partial<TaskAssignments>;
};

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

function readJsonField(
  raw: Prisma.JsonValue | null | undefined,
): Record<string, unknown> {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as Record<string, unknown>;
}

function parseProviderConnections(
  raw: Record<string, unknown>,
): Record<string, ProviderConnection> {
  const providerConnections: Record<string, ProviderConnection> = {};
  for (const [providerId, value] of Object.entries(raw)) {
    const conn = readProviderConnection(value);
    if (!conn || isProviderConnectionEmpty(conn)) continue;
    providerConnections[providerId] = normalizeProviderConnection(conn);
  }
  return providerConnections;
}

function parseTaskAssignments(raw: Record<string, unknown>): TaskAssignments {
  const assignments = {} as TaskAssignments;
  for (const taskId of MODEL_TASK_IDS) {
    const value = raw[taskId];
    assignments[taskId] =
      typeof value === "string" && value.trim() !== "" ? value.trim() : null;
  }
  return assignments;
}

/**
 * Read the persisted provider connections and task assignments. Unknown
 * JSON keys (e.g. stale capability-named task keys from before the task
 * split) are ignored.
 */
export async function loadModelConfig(): Promise<ModelConfig> {
  const [providerRow, taskRow] = await Promise.all([
    getPrisma().appModelProviderConfig.findUnique({
      where: { id: CONFIG_ID },
    }),
    getPrisma().appModelTaskConfig.findUnique({ where: { id: CONFIG_ID } }),
  ]);
  return {
    providerConnections: parseProviderConnections(
      readJsonField(providerRow?.providerConnections),
    ),
    tasks: parseTaskAssignments(readJsonField(taskRow?.tasks)),
  };
}

/**
 * Persist `providerConnections` + `tasks`. Empty connection entries are
 * dropped; any `tasks[task]` whose model is unknown, lacks the task's
 * required capability, or whose provider is no longer fully configured is
 * auto-nulled before write. Both singleton rows are written in one
 * transaction.
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
  const mergedTasks: TaskAssignments = {
    ...existing.tasks,
    ...pickTaskAssignments(input.tasks),
  };
  for (const taskId of MODEL_TASK_IDS) {
    const modelId = mergedTasks[taskId];
    if (modelId == null) continue;
    const model = getModelById(modelId);
    if (!model) {
      mergedTasks[taskId] = null;
      continue;
    }
    const required = requiredCapabilitiesByTask(taskId);
    if (!required.every((cap) => model.capabilities[cap] === true)) {
      mergedTasks[taskId] = null;
      continue;
    }
    const provider = getProviderById(model.providerId);
    if (!provider) {
      mergedTasks[taskId] = null;
      continue;
    }
    const conn = mergedConns[provider.id];
    if (!conn || !isFullyConfigured(conn, provider.id).ok) {
      mergedTasks[taskId] = null;
    }
  }

  const prisma = getPrisma();
  await prisma.$transaction([
    prisma.appModelProviderConfig.upsert({
      where: { id: CONFIG_ID },
      create: {
        id: CONFIG_ID,
        providerConnections: mergedConns as unknown as Prisma.InputJsonValue,
      },
      update: {
        providerConnections: mergedConns as unknown as Prisma.InputJsonValue,
      },
    }),
    prisma.appModelTaskConfig.upsert({
      where: { id: CONFIG_ID },
      create: {
        id: CONFIG_ID,
        tasks: mergedTasks as unknown as Prisma.InputJsonValue,
      },
      update: {
        tasks: mergedTasks as unknown as Prisma.InputJsonValue,
      },
    }),
  ]);

  return loadModelConfig();
}

/** Keep only known task ids when a raw body supplies assignments. */
function pickTaskAssignments(
  raw: Record<string, unknown> | undefined,
): Partial<TaskAssignments> | undefined {
  if (raw == null) return undefined;
  const out: Partial<TaskAssignments> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!isModelTaskId(key)) continue;
    out[key] =
      typeof value === "string" && value.trim() !== "" ? value.trim() : null;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}
