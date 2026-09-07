import { status } from "elysia";
import {
  loadModelConfig,
  saveModelConfig,
} from "../../../shared/model-tasks/index.ts";
import { MODELS, PROVIDERS } from "../../../shared/models/index.ts";
import type {
  Model,
  Provider,
  ProviderConnection,
} from "../../../shared/models/types.ts";
import { runTestEmbed } from "./diagnostics.ts";
import type { ModelProvidersModel } from "./model.ts";

function readConnection(value: unknown): ProviderConnection | null {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const v = value as Record<string, unknown>;
  return {
    apiKey:
      typeof v.apiKey === "string" && v.apiKey.trim() !== ""
        ? v.apiKey.trim()
        : null,
    baseUrl:
      typeof v.baseUrl === "string" && v.baseUrl.trim() !== ""
        ? v.baseUrl.trim()
        : null,
    port:
      typeof v.port === "number" && Number.isInteger(v.port) && v.port > 0
        ? v.port
        : null,
  };
}

function readProviderConnections(
  raw: unknown,
): Record<string, ProviderConnection | null> | undefined {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw))
    return undefined;
  const out: Record<string, ProviderConnection | null> = {};
  for (const [providerId, value] of Object.entries(
    raw as Record<string, unknown>,
  )) {
    out[providerId] = readConnection(value);
  }
  return out;
}

function providerResponse(config: {
  providerConnections: Record<string, ProviderConnection>;
}): ModelProvidersModel["response"] {
  return {
    config: { providerConnections: config.providerConnections },
    providers: [...PROVIDERS] as Provider[],
    models: [...MODELS] as Model[],
  };
}

export abstract class ModelProviders {
  /** Read the saved per-provider connections plus the static catalog. */
  static async get(): Promise<ModelProvidersModel["response"]> {
    const config = await loadModelConfig();
    return providerResponse(config);
  }

  /** Update per-provider connections (partial). */
  static async put(
    body: ModelProvidersModel["putBody"],
  ): Promise<ModelProvidersModel["response"]> {
    const saved = await saveModelConfig({
      providerConnections: readProviderConnections(body.providerConnections),
    });
    return providerResponse(saved);
  }

  /**
   * Embed a hardcoded diagnostic string via the clicked catalog model and
   * return the raw vector. Used by the per-model "Test embed" button on
   * the providers page. Tests the model itself over its provider's saved
   * connection — no task assignment is required.
   */
  static async testEmbed(
    body: ModelProvidersModel["embedBody"],
  ): Promise<ModelProvidersModel["embedResponse"]> {
    try {
      return await runTestEmbed("Why is the sky blue?", {
        modelId: body.modelId,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw status(400, { error: msg });
    }
  }
}
