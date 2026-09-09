import { status } from "elysia";
import { revalidateTaskAssignments } from "../task-model-map/dal.ts";
import {
  allModels,
  PROVIDERS,
  type ProviderConnection,
} from "./core/catalog.ts";
import {
  loadProviderConnections,
  saveProviderConnections,
} from "./core/dal.ts";
import { runTestChat, runTestEmbed } from "./diagnostics.ts";
import type { ModelProvidersModel } from "./model.ts";

function providerResponse(config: {
  providerConnections: Record<string, ProviderConnection>;
}): ModelProvidersModel["response"] {
  return {
    config: { providerConnections: config.providerConnections },
    providers: [
      ...PROVIDERS,
    ] as unknown as ModelProvidersModel["response"]["providers"],
    models: allModels(),
  };
}

export abstract class ModelProviders {
  /** Read the saved per-provider connections plus the static catalog. */
  static async get(): Promise<ModelProvidersModel["response"]> {
    const providerConnections = await loadProviderConnections();
    return providerResponse({ providerConnections });
  }

  /** Update per-provider connections (partial); revalidate task assignments. */
  static async put(
    body: ModelProvidersModel["putBody"],
  ): Promise<ModelProvidersModel["response"]> {
    const providerConnections = await saveProviderConnections(
      body.providerConnections as Record<string, unknown> | undefined,
    );
    await revalidateTaskAssignments(providerConnections);
    return providerResponse({ providerConnections });
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
        providerId: body.providerId,
        modelId: body.modelId,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw status(400, { error: msg });
    }
  }

  /**
   * Run a one-shot chat call on the clicked catalog model (sends the
   * vendor's official sample request) over its provider's saved
   * connection. Tests the model itself — no text task assignment required.
   */
  static async testChat(
    body: ModelProvidersModel["chatBody"],
  ): Promise<ModelProvidersModel["chatResponse"]> {
    try {
      return await runTestChat({
        providerId: body.providerId,
        modelId: body.modelId,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw status(400, { error: msg });
    }
  }
}
