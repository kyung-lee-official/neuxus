/**
 * DB-backed per-task model config (`app_model_config`).
 *
 * Single row, id = `"default"`. Three JSON columns (`embedding`, `llm`,
 * `vision`) each hold a `ModelSlot` or null. The catalog (`catalog.ts`)
 * owns wire params — the slot only carries the model id plus optional
 * per-slot connection overrides (apiKey, baseUrl, port).
 */

import { Prisma } from "../../generated/prisma/client.ts";
import { getPrisma } from "../db.ts";
import { getModelById } from "./catalog.ts";
import { getProviderById } from "./providers.ts";
import type {
  CapabilityTag,
  ModelConfig,
  ModelSlot,
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

/** Validate a raw JSON payload into a typed `ModelSlot`, or null. */
function readSlot(
  value: Prisma.JsonValue | null | undefined,
): ModelSlot | null {
  if (value == null) return null;
  if (typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  const modelId = blankToNull(v.modelId as string | null | undefined);
  if (!modelId) return null;
  return {
    modelId,
    apiKey: blankToNull(v.apiKey as string | null | undefined),
    baseUrl: blankToNull(v.baseUrl as string | null | undefined),
    port: portOrNull(v.port as number | null | undefined),
  };
}

function normalizeSlot(slot: ModelSlot): ModelSlot {
  return {
    modelId: slot.modelId,
    apiKey: slot.apiKey ?? null,
    baseUrl: slot.baseUrl ?? null,
    port: slot.port ?? null,
  };
}

function slotToJson(
  slot: ModelSlot | null,
): Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue {
  return slot ? (slot as Prisma.InputJsonValue) : Prisma.JsonNull;
}

function rawConfig(config: ModelConfig): {
  embedding: Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue;
  llm: Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue;
  vision: Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue;
} {
  return {
    embedding: slotToJson(config.embedding),
    llm: slotToJson(config.llm),
    vision: slotToJson(config.vision),
  };
}

export async function loadModelConfig(): Promise<ModelConfig> {
  const row = await getPrisma().appModelConfig.findUnique({
    where: { id: CONFIG_ID },
  });
  return {
    embedding: normalizeSlotOrNull(readSlot(row?.embedding ?? null)),
    llm: normalizeSlotOrNull(readSlot(row?.llm ?? null)),
    vision: normalizeSlotOrNull(readSlot(row?.vision ?? null)),
  };
}

function normalizeSlotOrNull(slot: ModelSlot | null): ModelSlot | null {
  return slot ? normalizeSlot(slot) : null;
}

/**
 * Upsert `app_model_config` id `default`. Each slot may be `null` to
 * clear it. Returns the freshly-loaded config.
 */
export async function saveModelConfig(
  config: ModelConfig,
): Promise<ModelConfig> {
  const normalized: ModelConfig = {
    embedding: config.embedding ? normalizeSlot(config.embedding) : null,
    llm: config.llm ? normalizeSlot(config.llm) : null,
    vision: config.vision ? normalizeSlot(config.vision) : null,
  };
  await getPrisma().appModelConfig.upsert({
    where: { id: CONFIG_ID },
    create: {
      id: CONFIG_ID,
      ...rawConfig(normalized),
    },
    update: rawConfig(normalized),
  });
  return loadModelConfig();
}

export type ResolveModelError =
  | { kind: "not_configured" }
  | { kind: "unknown_model"; modelId: string }
  | { kind: "missing_provider"; providerId: string }
  | { kind: "missing_capability"; task: CapabilityTag };

/**
 * Resolve a task slot to a `(Model, Provider, slot)` triple. Throws a
 * descriptive `Error` when the slot is empty, the model id is unknown,
 * the provider id is unknown, or the model doesn't declare the
 * requested capability.
 */
export function resolveModel(
  task: CapabilityTag,
  config: ModelConfig,
): ResolvedModel {
  const slot = config[task];
  if (!slot) {
    throw new Error(
      `No model configured for ${task}. Pick one in Server settings → Models.`,
    );
  }
  const model = getModelById(slot.modelId);
  if (!model) {
    throw new Error(`Unknown model id: ${slot.modelId}`);
  }
  const provider = getProviderById(model.providerId);
  if (!provider) {
    throw new Error(
      `Unknown provider id: ${model.providerId} (referenced by ${slot.modelId})`,
    );
  }
  if (model.capabilities[task] !== true) {
    throw new Error(
      `Model ${slot.modelId} does not support ${task} capability`,
    );
  }
  return { task, slot, model, provider };
}
