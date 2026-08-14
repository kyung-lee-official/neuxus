import { status } from "elysia";
import { nukeDatabases } from "../../shared/db.ts";
import {
  type EmbedSettingsRow,
  loadEmbedSettings,
  saveEmbedSettings,
} from "../../shared/embed/index.ts";
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
