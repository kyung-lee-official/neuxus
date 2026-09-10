/**
 * Model-providers business layer.
 *
 * Providers and their connections are resources backed by the locked
 * `core` module. Every operation resolves a provider singleton from the
 * catalog and delegates through it (its own validation + connection
 * load/save + capability calls).
 */

import { status } from "elysia";
import {
  type AnyProvider,
  getModel,
  getProviderById,
  PROVIDERS,
} from "./core/catalog.ts";
import { saveProviderConnections } from "./core/dal.ts";
import type { ModelProvidersModel } from "./model.ts";

function unknownProvider(providerId: string): never {
  throw status(404, { error: `Unknown provider: ${providerId}` });
}

function asError(err: unknown): { error: string } {
  const msg = err instanceof Error ? err.message : String(err);
  return { error: msg };
}

/** Serialize a provider singleton to its catalog view (data only). */
function toProviderView(
  provider: AnyProvider,
): ModelProvidersModel["providersResponse"]["providers"][number] {
  return {
    id: provider.id,
    displayName: provider.displayName,
    ...(provider.baseUrl ? { baseUrl: provider.baseUrl } : {}),
    ...(provider.headers ? { headers: provider.headers } : {}),
    models: provider.models.map((model) => ({ ...model })),
  };
}

function getProvider(providerId: string): AnyProvider {
  const provider = getProviderById(providerId);
  if (!provider) unknownProvider(providerId);
  return provider;
}

export abstract class ModelProviders {
  /** Static catalog: providers with their models nested. */
  static async getProviders(): Promise<
    ModelProvidersModel["providersResponse"]
  > {
    return { providers: PROVIDERS.map((p) => toProviderView(p)) };
  }

  /** Read one provider's saved connection payload (or null). */
  static async getConnection(
    providerId: string,
  ): Promise<ModelProvidersModel["connectionResponse"]> {
    const provider = getProvider(providerId);
    const connection = await provider.loadConnection();
    return { providerId, connection };
  }

  /** Save one provider's connection payload (validated by the provider). */
  static async putConnection(
    providerId: string,
    body: ModelProvidersModel["connectionBody"],
  ): Promise<ModelProvidersModel["connectionResponse"]> {
    const provider = getProvider(providerId);
    if (
      body.connection == null ||
      typeof body.connection !== "object" ||
      Array.isArray(body.connection)
    ) {
      throw status(400, { error: "connection must be an object" });
    }
    try {
      const connection = await provider.saveConnection(body.connection);
      return { providerId, connection };
    } catch (err) {
      throw status(400, asError(err));
    }
  }

  /** Clear one provider's saved connection. */
  static async deleteConnection(
    providerId: string,
  ): Promise<ModelProvidersModel["deleteResponse"]> {
    getProvider(providerId);
    await saveProviderConnections({ [providerId]: null });
    return { providerId, deleted: true };
  }

  /** One-shot embed test against an explicit model on its provider. */
  static async testEmbed(
    providerId: string,
    body: ModelProvidersModel["embedTestBody"],
  ): Promise<ModelProvidersModel["embedTestResponse"]> {
    const provider = getProvider(providerId);
    const model = requireModel(providerId, body.modelId, "embedding");
    const text = "Why is the sky blue?";
    try {
      const vectors = await provider.embed(model.modelId, [text]);
      const embedding = vectors[0];
      if (!embedding) throw new Error("Embedder returned no vector");
      return {
        embedding,
        modelId: model.modelId,
        dim: embedding.length,
        inputText: text,
      };
    } catch (err) {
      throw status(400, asError(err));
    }
  }

  /** One-shot textChat test against an explicit model on its provider. */
  static async testChat(
    providerId: string,
    body: ModelProvidersModel["chatTestBody"],
  ): Promise<ModelProvidersModel["textTestResponse"]> {
    const provider = getProvider(providerId);
    const model = requireModel(providerId, body.modelId, "text");
    try {
      const response = await provider.textChat(model.modelId, body.prompt);
      return { modelId: model.modelId, response };
    } catch (err) {
      throw status(400, asError(err));
    }
  }

  /** One-shot image test against an explicit model on its provider. */
  static async testImage(
    providerId: string,
    body: ModelProvidersModel["imageTestBody"],
  ): Promise<ModelProvidersModel["textTestResponse"]> {
    const provider = getProvider(providerId);
    const model = requireModel(providerId, body.modelId, "vision");
    const bytes = Buffer.from(body.image.data, "base64");
    try {
      const response = await provider.imageChat(model.modelId, body.prompt, {
        bytes,
        mimeType: body.image.mimeType,
      });
      return { modelId: model.modelId, response };
    } catch (err) {
      throw status(400, asError(err));
    }
  }
}

function requireModel(
  providerId: string,
  modelId: string,
  capability: "embedding" | "text" | "vision",
): NonNullable<ReturnType<typeof getModel>> {
  const model = getModel(providerId, modelId);
  if (!model) {
    throw status(404, { error: `Unknown model: ${providerId}/${modelId}` });
  }
  if (model.capabilities[capability] !== true) {
    throw status(400, {
      error: `Model ${providerId}/${modelId} does not support the ${capability} capability`,
    });
  }
  return model;
}
