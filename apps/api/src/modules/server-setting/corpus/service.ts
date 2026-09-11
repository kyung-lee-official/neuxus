import { status } from "elysia";
import {
  CorpusGitError,
  CorpusLockedError,
  Corpus as CorpusService,
  CorpusSettings,
  type CorpusSettingsRow,
} from "../../knowledge/corpus/index.ts";
import type { CorpusModel } from "./model.ts";

function mapCorpusError(err: unknown): never {
  if (err instanceof CorpusGitError || err instanceof CorpusLockedError) {
    throw status(err.httpStatus, { error: err.message });
  }
  const msg = err instanceof Error ? err.message : String(err);
  throw status(500, { error: msg });
}

export abstract class Corpus {
  static async get() {
    return CorpusSettings.load();
  }

  static async put(body: CorpusModel["corpusBody"]) {
    const row: CorpusSettingsRow = {
      repoUrl: body.repoUrl,
      branch: body.branch,
      docsRoot: body.docsRoot,
    };
    return CorpusSettings.save(row);
  }

  static async clone() {
    try {
      return await CorpusService.clone();
    } catch (err) {
      return mapCorpusError(err);
    }
  }

  static async pull() {
    try {
      return await CorpusService.pull();
    } catch (err) {
      return mapCorpusError(err);
    }
  }

  static async chunkify() {
    try {
      const result = await CorpusService.rechunk();
      return { ok: true as const, ...result };
    } catch (err) {
      return mapCorpusError(err);
    }
  }

  static async embed() {
    try {
      const result = await CorpusService.embed();
      return { ok: true as const, ...result };
    } catch (err) {
      return mapCorpusError(err);
    }
  }

  static startSync() {
    try {
      CorpusService.sync();
      return status(202, { ok: true as const });
    } catch (err) {
      return mapCorpusError(err);
    }
  }

  static events() {
    return CorpusService.events();
  }
}
