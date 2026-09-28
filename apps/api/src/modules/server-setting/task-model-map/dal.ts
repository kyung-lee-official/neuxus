/**
 * Task-model-map DAL. Owns the `app_model_task_config` singleton row
 * (id `default`).
 *
 * Internal to the task-model-map sub-module: only `service.ts` imports it.
 */

import { Prisma } from "../../../generated/prisma/client.ts";
import { getPrisma } from "../../../shared/db.ts";

const CONFIG_ID = "default";

/**
 * Raw persisted task links (a JSON object), or null when the row is missing
 * or does not hold an object.
 */
export async function findTaskLinks(): Promise<Record<string, unknown> | null> {
  const row = await getPrisma().appModelTaskConfig.findUnique({
    where: { id: CONFIG_ID },
  });
  const stored = row?.tasks;
  if (stored == null || typeof stored !== "object" || Array.isArray(stored)) {
    return null;
  }
  return stored as Record<string, unknown>;
}

/** Upsert the raw task-links JSON object. */
export async function saveTaskLinks(
  tasks: Record<string, unknown>,
): Promise<void> {
  const value = tasks as unknown as Prisma.InputJsonValue;
  await getPrisma().appModelTaskConfig.upsert({
    where: { id: CONFIG_ID },
    create: { id: CONFIG_ID, tasks: value },
    update: { tasks: value },
  });
}
