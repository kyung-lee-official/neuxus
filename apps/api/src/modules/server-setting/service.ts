import { status } from "elysia";
import {
  type CorpusSettingsRow,
  loadCorpusSettings,
  saveCorpusSettings,
} from "../../shared/corpus/index.ts";
import { nukeDatabases } from "../../shared/db.ts";
import {
  type EmbedSettingsRow,
  loadEmbedSettings,
  saveEmbedSettings,
} from "../../shared/embed/index.ts";
import {
  loadSynthesisSettings,
  type SynthesisSettingsRow,
  saveSynthesisSettings,
} from "../../shared/synthesis/index.ts";
import type { ServerSettingModel } from "./model.ts";

export abstract class ServerSetting {
  static async getEmbed() {
    return loadEmbedSettings();
  }

  static async putEmbed(body: ServerSettingModel["embedBody"]) {
    const row: EmbedSettingsRow = {
      embeddingModel: body.embeddingModel,
      provider: body.provider,
      host: body.host,
      port: body.port,
      apiKey: body.apiKey,
    };
    return saveEmbedSettings(row);
  }

  static async getSynthesis() {
    return loadSynthesisSettings();
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
    return saveSynthesisSettings(row);
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
