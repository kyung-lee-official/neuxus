/**
 * DAL for the task-model-map business. Its only job: which business task
 * uses which catalog model. Assignments (`app_model_task_config`) map a
 * task id to a `{ providerId, modelId }` pair; the pair must resolve in
 * the `model-providers` catalog and cover the task's required capabilities.
 */

import { Prisma } from "../../../generated/prisma/client.ts";
import { getPrisma } from "../../../shared/db.ts";
import { getModel } from "../model-providers/core/catalog.ts";
import {
  CAPABILITY_EMBEDDING,
  CAPABILITY_TEXT,
  CAPABILITY_VISION,
  type CapabilityTag,
} from "../model-providers/core/types.ts";
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

/** A selected catalog model, identified by its provider + model pair. */
export type ModelPointer = {
  providerId: string;
  modelId: string;
};

export type TaskAssignments = Record<ModelTaskId, ModelPointer | null>;

/** Strictly parse one task value: `null` = unassigned; else the pair must resolve in the catalog. */
function parseModelPointer(
  value: unknown,
  taskId: ModelTaskId,
): ModelPointer | null {
  if (value == null) return null;
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Invalid task assignment for ${taskId}`);
  }
  const v = value as Record<string, unknown>;
  const providerId = typeof v.providerId === "string" ? v.providerId : "";
  const modelId = typeof v.modelId === "string" ? v.modelId : "";
  if (providerId !== providerId.trim() || modelId !== modelId.trim()) {
    throw new Error(
      `Task assignment for ${taskId} must not have leading/trailing whitespace`,
    );
  }
  const model = getModel(providerId, modelId);
  if (!model) {
    throw new Error(
      `Unknown model for task ${taskId}: ${providerId}/${modelId}`,
    );
  }
  const required = requiredCapabilitiesByTask(taskId);
  if (!required.every((cap) => model.capabilities[cap] === true)) {
    throw new Error(
      `Model ${providerId}/${modelId} cannot serve task ${taskId}`,
    );
  }
  return { providerId, modelId };
}

function parseTaskAssignments(raw: Record<string, unknown>): TaskAssignments {
  const assignments = {} as TaskAssignments;
  for (const taskId of MODEL_TASK_IDS) {
    assignments[taskId] = parseModelPointer(raw[taskId], taskId);
  }
  return assignments;
}

function readJsonField(
  raw: Prisma.JsonValue | null | undefined,
): Record<string, unknown> {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as Record<string, unknown>;
}

/** Read the persisted task assignments. Unknown JSON keys are ignored. */
export async function loadAssignments(): Promise<TaskAssignments> {
  const row = await getPrisma().appModelTaskConfig.findUnique({
    where: { id: CONFIG_ID },
  });
  return parseTaskAssignments(readJsonField(row?.tasks));
}

/** Keep only known task ids when a raw body supplies assignments. */
function pickTaskAssignments(
  raw: Record<string, unknown> | undefined,
): Partial<TaskAssignments> | undefined {
  if (raw == null) return undefined;
  const out: Partial<TaskAssignments> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!isModelTaskId(key)) continue;
    out[key] = parseModelPointer(value, key);
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Save a partial assignments patch. The pair must resolve in the catalog
 * and cover the task's required capabilities (throws otherwise). Writes
 * only the `app_model_task_config` row.
 */
export async function saveAssignments(
  input: Record<string, unknown> | undefined,
): Promise<TaskAssignments> {
  const existing = await loadAssignments();
  const merged: TaskAssignments = {
    ...existing,
    ...pickTaskAssignments(input),
  };
  await getPrisma().appModelTaskConfig.upsert({
    where: { id: CONFIG_ID },
    create: {
      id: CONFIG_ID,
      tasks: merged as unknown as Prisma.InputJsonValue,
    },
    update: {
      tasks: merged as unknown as Prisma.InputJsonValue,
    },
  });
  return merged;
}
