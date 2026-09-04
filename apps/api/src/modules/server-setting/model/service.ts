import { status } from "elysia";
import {
  loadModelConfig,
  MODELS,
  PROVIDERS,
  saveModelConfig,
} from "../../../shared/models/index.ts";
import type {
  Model,
  ModelConfig,
  Provider,
  ProviderConnection,
} from "../../../shared/models/types.ts";
import {
  runTestChat,
  runTestEmbed,
  runTestEmbeddingSearch,
  runTestVision,
} from "./diagnostics.ts";
import type { ModelRegistryModel } from "./model.ts";

function asError(err: unknown): { error: string } {
  const msg = err instanceof Error ? err.message : String(err);
  return { error: msg };
}

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

function readTasks(raw: unknown): ModelConfig["tasks"] | undefined {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw))
    return undefined;
  const v = raw as Record<string, unknown>;
  const pick = (key: string): string | null => {
    const x = v[key];
    return typeof x === "string" && x.trim() !== "" ? x.trim() : null;
  };
  return {
    embedding: pick("embedding"),
    llm: pick("llm"),
    vision: pick("vision"),
  };
}

export abstract class ModelRegistry {
  /** Read the providerConnections/tasks map plus the static catalog. */
  static async get(): Promise<ModelRegistryModel["modelResponse"]> {
    const config = await loadModelConfig();
    return {
      config,
      providers: [...PROVIDERS] as Provider[],
      models: [...MODELS] as Model[],
    };
  }

  /** Update providerConnections and/or tasks. Either may be partial. */
  static async put(
    body: ModelRegistryModel["modelBody"],
  ): Promise<ModelRegistryModel["modelResponse"]> {
    const saved = await saveModelConfig({
      providerConnections: readProviderConnections(body.providerConnections),
      tasks: readTasks(body.tasks),
    });
    return {
      config: saved,
      providers: [...PROVIDERS] as Provider[],
      models: [...MODELS] as Model[],
    };
  }

  /**
   * Run a one-shot test against the configured model for the given
   * task. Dispatches on `body.task` since each task has its own body
   * shape (embed / chat / vision).
   */
  static async test(
    body: ModelRegistryModel["modelTestBody"],
  ): Promise<unknown> {
    try {
      switch (body.task) {
        case "embedding": {
          const query = typeof body.query === "string" ? body.query.trim() : "";
          if (query === "") {
            throw new Error("query is required for embedding test");
          }
          const limit =
            typeof body.limit === "number" && Number.isInteger(body.limit)
              ? Math.max(1, Math.min(50, body.limit))
              : 10;
          return {
            task: "embedding" as const,
            ...(await runTestEmbeddingSearch(query, limit)),
          };
        }
        case "llm": {
          const prompt =
            typeof body.prompt === "string" ? body.prompt.trim() : "";
          if (prompt === "") {
            throw new Error("prompt is required for llm test");
          }
          return {
            task: "llm" as const,
            ...(await runTestChat(prompt)),
          };
        }
        case "vision": {
          const imageBase64 =
            typeof body.imageBase64 === "string" ? body.imageBase64 : "";
          const mimeType =
            typeof body.mimeType === "string" && body.mimeType !== ""
              ? body.mimeType
              : "application/octet-stream";
          const name =
            typeof body.name === "string" && body.name !== ""
              ? body.name
              : "image";
          if (imageBase64 === "") {
            throw new Error("imageBase64 is required for vision test");
          }
          return {
            task: "vision" as const,
            ...(await runTestVision({ imageBase64, mimeType, name })),
          };
        }
        default:
          throw new Error(
            `unknown task: ${String((body as { task?: unknown }).task)}`,
          );
      }
    } catch (err) {
      throw status(400, asError(err));
    }
  }

  /**
   * Embed a hardcoded diagnostic string via the clicked catalog model
   * and return the raw vector. Used by the per-model "Test embed"
   * button on the providers page. Unlike the task-scoped tests, this
   * does not require an embedding task assignment — it tests the model
   * itself over its provider's saved connection.
   */
  static async testEmbed(
    body: ModelRegistryModel["testEmbedBody"],
  ): Promise<ModelRegistryModel["testEmbedResponse"]> {
    try {
      return await runTestEmbed("Why is the sky blue?", {
        modelId: body.modelId,
      });
    } catch (err) {
      throw status(400, asError(err));
    }
  }
}
