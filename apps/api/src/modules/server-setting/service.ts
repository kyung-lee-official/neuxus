import { status } from "elysia";
import {
  CorpusGitError,
  type CorpusSettingsRow,
  cloneCorpusStream,
  corpusEventStream,
  emitProgress,
  emitStage,
  finishCorpusOp,
  loadCorpusSettings,
  pullCorpusStream,
  rechunkAllPages,
  runCorpusSync,
  saveCorpusSettings,
  tryStartCorpusOp,
} from "../../shared/corpus/index.ts";
import { nukeDatabases } from "../../shared/db.ts";
import { embedStaleChildren } from "../../shared/embed/children.ts";
import {
  adminLogSettings,
  type LogSettingsRow,
  purgeLogs,
  resetLogSettings,
  saveLogSettings,
} from "../../shared/log/index.ts";
import {
  loadModelConfig,
  MODELS,
  PROVIDERS,
  saveModelConfig,
} from "../../shared/models/index.ts";
import type {
  Model,
  ModelConfig,
  Provider,
  ProviderConnection,
} from "../../shared/models/types.ts";
import {
  adminRetrieveSettings,
  type RetrieveSettingsRow,
  resetRetrieveSettings,
  saveRetrieveSettings,
} from "../../shared/retrieve/index.ts";
import type { ServerSettingModel } from "./model.ts";
import {
  runTestChat,
  runTestEmbeddingSearch,
  runTestVision,
} from "./model-test.ts";

const LOCKED_MESSAGE = "A corpus operation is already running.";

function mapCorpusError(err: unknown): never {
  if (err instanceof CorpusGitError) {
    throw status(err.httpStatus, { error: err.message });
  }
  const msg = err instanceof Error ? err.message : String(err);
  throw status(500, { error: msg });
}

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

export abstract class ServerSetting {
  /** Read the providerConnections/tasks map plus the static catalog. */
  static async getModel(): Promise<ServerSettingModel["modelResponse"]> {
    const config = await loadModelConfig();
    return {
      config,
      providers: [...PROVIDERS] as Provider[],
      models: [...MODELS] as Model[],
    };
  }

  /** Update providerConnections and/or tasks. Either may be partial. */
  static async putModel(
    body: ServerSettingModel["modelBody"],
  ): Promise<ServerSettingModel["modelResponse"]> {
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
  static async testModel(
    body: ServerSettingModel["modelTestBody"],
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

  static async getLog() {
    return adminLogSettings();
  }

  static async putLog(body: ServerSettingModel["logBody"]) {
    const row: LogSettingsRow = {
      sinks: body.sinks,
      queueSize: body.queueSize,
      drainTimeoutMs: body.drainTimeoutMs,
      pretty: body.pretty,
    };
    await saveLogSettings(row);
    return adminLogSettings();
  }

  static async resetLog() {
    return resetLogSettings();
  }

  static async purgeLogs() {
    return purgeLogs();
  }

  static async getRetrieve() {
    return adminRetrieveSettings();
  }

  static async putRetrieve(body: ServerSettingModel["retrieveBody"]) {
    const row: RetrieveSettingsRow = {
      childLimit: body.childLimit,
      maxParents: body.maxParents,
      maxCharacters: body.maxCharacters,
    };
    await saveRetrieveSettings(row);
    return adminRetrieveSettings();
  }

  static async resetRetrieve() {
    return resetRetrieveSettings();
  }

  static async getCorpus() {
    return loadCorpusSettings();
  }

  static async putCorpus(body: ServerSettingModel["corpusBody"]) {
    const row: CorpusSettingsRow = {
      repoUrl: body.repoUrl,
      branch: body.branch,
      docsRoot: body.docsRoot,
    };
    return saveCorpusSettings(row);
  }

  static async cloneCorpus() {
    if (!tryStartCorpusOp("clone")) {
      throw status(409, { error: LOCKED_MESSAGE });
    }
    try {
      const result = await cloneCorpusStream(emitProgress);
      finishCorpusOp();
      return result;
    } catch (err) {
      finishCorpusOp(err);
      return mapCorpusError(err);
    }
  }

  static async pullCorpus() {
    if (!tryStartCorpusOp("pull")) {
      throw status(409, { error: LOCKED_MESSAGE });
    }
    try {
      const result = await pullCorpusStream(emitStage);
      finishCorpusOp();
      return result;
    } catch (err) {
      finishCorpusOp(err);
      return mapCorpusError(err);
    }
  }

  static async chunkifyCorpus() {
    if (!tryStartCorpusOp("chunkify")) {
      throw status(409, { error: LOCKED_MESSAGE });
    }
    try {
      emitStage("chunkify");
      const result = await rechunkAllPages();
      finishCorpusOp();
      return { ok: true as const, ...result };
    } catch (err) {
      finishCorpusOp(err);
      const msg = err instanceof Error ? err.message : String(err);
      throw status(500, { error: msg });
    }
  }

  static async embedCorpus() {
    if (!tryStartCorpusOp("embed")) {
      throw status(409, { error: LOCKED_MESSAGE });
    }
    try {
      emitStage("embed");
      const result = await embedStaleChildren({ failFast: true });
      finishCorpusOp();
      return { ok: true as const, ...result };
    } catch (err) {
      finishCorpusOp(err);
      const msg = err instanceof Error ? err.message : String(err);
      throw status(500, { error: msg });
    }
  }

  static startCorpusSync() {
    if (!tryStartCorpusOp("sync")) {
      throw status(409, { error: LOCKED_MESSAGE });
    }
    void runCorpusSync().catch(() => {
      /* errors already recorded in status via finishCorpusOp(err) */
    });
    return status(202, { ok: true as const });
  }

  static corpusEvents() {
    return corpusEventStream();
  }

  static async nuke(body: ServerSettingModel["nukeBody"]) {
    try {
      await nukeDatabases(body.target);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw status(500, { error: msg });
    }
    return { ok: true as const, nuked: true as const, target: body.target };
  }
}
