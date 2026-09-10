/**
 * DAL for the task-model-map business. Its only job: which business task
 * uses which catalog model. Assignments (`app_model_task_config`) map a
 * task id to a `{ providerId, modelId }` pair; the pair must resolve in
 * the `model-providers` catalog and cover the task's required capabilities.
 */

import { Prisma } from "../../../generated/prisma/client.ts";
import { getPrisma } from "../../../shared/db.ts";
import { getModelByIdentifier } from "../model-providers/core/catalog.ts";
import {
  CAPABILITY_EMBEDDING,
  CAPABILITY_TEXT,
  CAPABILITY_VISION,
  type CapabilityTag,
} from "../model-providers/core/types.ts";
import type { TaskId } from "./type.ts";

const CONFIG_ID = "default";

/** Canonical task ids — single source of truth. */
export const TASK_EMBEDDING = "embedding";
export const TASK_TEXT_SYNTHESIS = "text-synthesis";
export const TASK_MD_IMAGE_CAPTIONING = "md-image-captioning";

/** Task definitions: id + the capabilities it requires. */
export const TASKS = [
  { id: TASK_EMBEDDING, requiredCapabilities: [CAPABILITY_EMBEDDING] },
  { id: TASK_TEXT_SYNTHESIS, requiredCapabilities: [CAPABILITY_TEXT] },
  {
    id: TASK_MD_IMAGE_CAPTIONING,
    // Describing images is generation over image input: text + vision.
    requiredCapabilities: [CAPABILITY_TEXT, CAPABILITY_VISION],
  },
] as const;

/** Id list, derived from `TASKS` — not a second definition. */
export const TASK_IDS = [
  TASK_EMBEDDING,
  TASK_TEXT_SYNTHESIS,
  TASK_MD_IMAGE_CAPTIONING,
] as const;

/** Capabilities a model must declare to serve `taskId`. */
export function requiredCapabilitiesByTask(
  taskId: TaskId,
): readonly CapabilityTag[] {
  const task = TASKS.find((t) => t.id === taskId);
  if (!task) {
    throw new Error(`Unknown task id: ${taskId}`);
  }
  return task.requiredCapabilities;
}

/** Task assignments: task id → catalog model `identifier` (or null). */
export type TaskAssignments = Record<TaskId, string | null>;

/** Validate a task→model link identifier (lowercase, resolves in catalog, can serve the task). */
function validateTaskModelLink(
  modelIdentifier: string,
  taskId: TaskId,
): string {
  const model = getModelByIdentifier(modelIdentifier);
  if (!model) {
    throw new Error(
      `Unknown model identifier for task ${taskId}: ${modelIdentifier}`,
    );
  }
  const required = requiredCapabilitiesByTask(taskId);
  if (!required.every((cap) => model.capabilities[cap] === true)) {
    throw new Error(`Model ${modelIdentifier} cannot serve task ${taskId}`);
  }
  return modelIdentifier;
}

function parseTaskAssignments(raw: Record<string, unknown>): TaskAssignments {
  const assignments = {} as TaskAssignments;
  for (const taskId of TASK_IDS) {
    const value = raw[taskId];
    if (value == null) {
      assignments[taskId] = null;
    } else if (typeof value !== "string") {
      throw new Error(`Invalid task assignment for ${taskId}`);
    } else {
      assignments[taskId] = validateTaskModelLink(value, taskId);
    }
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

/**
 * Save task assignment links. Every supplied key must be a known task id
 * and every value a catalog model identifier that can serve it — otherwise
 * this throws. Writes only the `app_model_task_config` row.
 */
export async function saveAssignments(
  input: Record<string, unknown>,
): Promise<TaskAssignments> {
  const merged = await loadAssignments();
  for (const [key, value] of Object.entries(input)) {
    if (!(TASK_IDS as readonly string[]).includes(key)) {
      throw new Error(`Unknown task: ${key}`);
    }
    const taskId = key as TaskId;
    if (value == null) {
      merged[taskId] = null;
    } else if (typeof value !== "string") {
      throw new Error(`Invalid task assignment for ${taskId}`);
    } else {
      merged[taskId] = validateTaskModelLink(value, taskId);
    }
  }
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
