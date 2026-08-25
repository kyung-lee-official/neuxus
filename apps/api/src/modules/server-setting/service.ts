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
  adminEmbedSettings,
  type EmbedSettingsRow,
  resetEmbedSettings,
  saveEmbedSettings,
} from "../../shared/embed/index.ts";
import {
  adminSynthesisSettings,
  resetSynthesisSettings,
  type SynthesisSettingsRow,
  saveSynthesisSettings,
} from "../../shared/synthesis/index.ts";
import type { ServerSettingModel } from "./model.ts";

const LOCKED_MESSAGE = "A corpus operation is already running.";

function mapCorpusError(err: unknown): never {
  if (err instanceof CorpusGitError) {
    throw status(err.httpStatus, { error: err.message });
  }
  const msg = err instanceof Error ? err.message : String(err);
  throw status(500, { error: msg });
}

export abstract class ServerSetting {
  static async getEmbed() {
    return adminEmbedSettings();
  }

  static async putEmbed(body: ServerSettingModel["embedBody"]) {
    const row: EmbedSettingsRow = {
      embeddingModel: body.embeddingModel,
      provider: body.provider,
      host: body.host,
      port: body.port,
      apiKey: body.apiKey,
    };
    await saveEmbedSettings(row);
    return adminEmbedSettings();
  }

  static async resetEmbed() {
    return resetEmbedSettings();
  }

  static async getSynthesis() {
    return adminSynthesisSettings();
  }

  static async putSynthesis(body: ServerSettingModel["synthesisBody"]) {
    const row: SynthesisSettingsRow = {
      provider: body.provider,
      synthesisModel: body.synthesisModel,
      baseUrl: body.baseUrl,
      apiKey: body.apiKey,
      maxTokens: body.maxTokens,
      contextWindowTokens: body.contextWindowTokens,
    };
    await saveSynthesisSettings(row);
    return adminSynthesisSettings();
  }

  static async resetSynthesis() {
    return resetSynthesisSettings();
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
