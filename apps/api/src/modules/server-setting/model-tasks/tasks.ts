/**
 * App tasks — product-level model needs.
 *
 * A task is what an app feature requires a model for. Each task declares
 * the model *capabilities* it needs; a model can serve it only when it
 * declares **all** of them (`requiredCapabilities ⊆ model.capabilities`).
 * Assignments (task → catalog `modelId`) are persisted in
 * `app_model_task_config`, apart from `app_model_provider_config` (raw
 * provider connections).
 *
 * The model registry knows only capabilities; it never sees these task ids.
 */

import type { CapabilityTag } from "../model-providers/types";

/** Single source of truth: every task with the capabilities it requires. */
export const MODEL_TASKS = [
  { id: "embedding", requiredCapabilities: ["embedding"] },
  { id: "llm-synthesis", requiredCapabilities: ["llm"] },
  {
    id: "md-image-captioning",
    // Describing images is generation over image input: needs llm + vision.
    requiredCapabilities: ["llm", "vision"],
  },
] as const;

/** Task id, derived from `MODEL_TASKS` (no separate literal list). */
export type ModelTaskId = (typeof MODEL_TASKS)[number]["id"];

export type ModelTask = {
  id: ModelTaskId;
  /** Every capability a model must declare to serve this task. */
  requiredCapabilities: readonly CapabilityTag[];
};

/** Id list, derived from `MODEL_TASKS` — not a second definition. */
export const MODEL_TASK_IDS: readonly ModelTaskId[] = MODEL_TASKS.map(
  (task) => task.id,
);

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
