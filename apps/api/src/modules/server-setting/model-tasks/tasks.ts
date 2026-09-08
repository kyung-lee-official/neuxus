/**
 * App tasks — product-level model needs.
 *
 * A task is what an app feature requires a model for. Each task declares
 * the model *capability* it needs; models that can serve it are found by
 * tag matching (`requiredCapability ∈ model.capabilities`). Assignments
 * (task → catalog `modelId`) are persisted in `app_model_task_config`,
 * apart from `app_model_provider_config` (raw provider connections).
 *
 * The model registry knows only capabilities; it never sees these task ids.
 */

import type { CapabilityTag } from "../model-providers/types";

/** Single source of truth: every task with the capability it requires. */
export const MODEL_TASKS = [
  { id: "embedding", requiredCapability: "embedding" },
  { id: "llm-synthesis", requiredCapability: "llm" },
  { id: "md-image-captioning", requiredCapability: "vision" },
] as const;

/** Task id, derived from `MODEL_TASKS` (no separate literal list). */
export type ModelTaskId = (typeof MODEL_TASKS)[number]["id"];

export type ModelTask = {
  id: ModelTaskId;
  /** Capability a model must declare to serve this task. */
  requiredCapability: CapabilityTag;
};

/** Id list, derived from `MODEL_TASKS` — not a second definition. */
export const MODEL_TASK_IDS: readonly ModelTaskId[] = MODEL_TASKS.map(
  (task) => task.id,
);

/** The capability a model must declare to serve `taskId`. */
export function requiredCapabilityByTask(taskId: ModelTaskId): CapabilityTag {
  return MODEL_TASKS.find((task) => task.id === taskId)!.requiredCapability;
}

/** Narrow a runtime value to a known task id (e.g. parsed JSON keys). */
export function isModelTaskId(value: unknown): value is ModelTaskId {
  return MODEL_TASK_IDS.some((id) => id === value);
}
