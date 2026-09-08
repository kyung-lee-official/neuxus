/**
 * App tasks — product-level model needs.
 *
 * A task is what an app feature requires a model for. Each task declares
 * the model *capability* it needs; models that can serve it are found by
 * tag matching (`requiredCapability ∈ model.capabilities`). Assignments
 * (task → catalog `modelId`) are persisted in `app_model_task_config`,
 * apart from `app_model_provider_config` (raw provider connections).
 *
 * The model registry (`shared/models`) knows only capabilities; it never
 * sees these task ids.
 */

import type { CapabilityTag } from "../model-providers/types";

export type ModelTaskId = "embedding" | "llm-synthesis" | "md-image-captioning";

export type ModelTask = {
  id: ModelTaskId;
  /** Capability a model must declare to serve this task. */
  requiredCapability: CapabilityTag;
};

export const MODEL_TASK_IDS: readonly ModelTaskId[] = [
  "embedding",
  "llm-synthesis",
  "md-image-captioning",
] as const;

export const MODEL_TASKS: readonly ModelTask[] = [
  { id: "embedding", requiredCapability: "embedding" },
  { id: "llm-synthesis", requiredCapability: "llm" },
  { id: "md-image-captioning", requiredCapability: "vision" },
];

/** The capability a model must declare to serve `taskId`. */
export function requiredCapabilityByTask(taskId: ModelTaskId): CapabilityTag {
  const task = MODEL_TASKS.find((t) => t.id === taskId);
  return task?.requiredCapability ?? "llm";
}

/** Narrow a runtime value to a known task id (e.g. parsed JSON keys). */
export function isModelTaskId(value: unknown): value is ModelTaskId {
  return MODEL_TASK_IDS.some((id) => id === value);
}
