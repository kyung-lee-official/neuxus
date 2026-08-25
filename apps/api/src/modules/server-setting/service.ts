import { status } from "elysia";
import {
  CorpusGitError,
  type CorpusSettingsRow,
  cloneCorpusStream,
  corpusGitEventStream,
  corpusSyncEventStream,
  emitProgress,
  emitStage,
  finishOperation,
  loadCorpusSettings,
  pullCorpusStream,
  saveCorpusSettings,
  tryStartClone,
  tryStartCorpusSync,
  tryStartPull,
} from "../../shared/corpus/index.ts";
import { nukeDatabases } from "../../shared/db.ts";
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
    if (!tryStartClone()) {
      throw status(409, { error: "Git operation already running." });
    }
    try {
      return await cloneCorpusStream(emitProgress);
    } catch (err) {
      finishOperation(err);
      if (err instanceof CorpusGitError) {
        throw status(err.httpStatus, { error: err.message });
      }
      const msg = err instanceof Error ? err.message : String(err);
      throw status(500, { error: msg });
    }
  }

  static async pullCorpus() {
    if (!tryStartPull()) {
      throw status(409, { error: "Git operation already running." });
    }
    try {
      return await pullCorpusStream(emitStage);
    } catch (err) {
      finishOperation(err);
      if (err instanceof CorpusGitError) {
        throw status(err.httpStatus, { error: err.message });
      }
      const msg = err instanceof Error ? err.message : String(err);
      throw status(500, { error: msg });
    }
  }

  static startCorpusSync() {
    if (!tryStartCorpusSync()) {
      throw status(409, { error: "Sync already running." });
    }
    return status(202, { ok: true as const });
  }

  static corpusSyncEvents() {
    return corpusSyncEventStream();
  }

  static corpusGitEvents() {
    return corpusGitEventStream();
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
