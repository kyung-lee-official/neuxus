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
} from "../../../shared/corpus/index.ts";
import { embedStaleChildren } from "../../../shared/embed/children.ts";
import type { CorpusModel } from "./model.ts";

const LOCKED_MESSAGE = "A corpus operation is already running.";

function mapCorpusError(err: unknown): never {
  if (err instanceof CorpusGitError) {
    throw status(err.httpStatus, { error: err.message });
  }
  const msg = err instanceof Error ? err.message : String(err);
  throw status(500, { error: msg });
}

export abstract class Corpus {
  static async get() {
    return loadCorpusSettings();
  }

  static async put(body: CorpusModel["corpusBody"]) {
    const row: CorpusSettingsRow = {
      repoUrl: body.repoUrl,
      branch: body.branch,
      docsRoot: body.docsRoot,
    };
    return saveCorpusSettings(row);
  }

  static async clone() {
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

  static async pull() {
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

  static async chunkify() {
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

  static async embed() {
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

  static startSync() {
    if (!tryStartCorpusOp("sync")) {
      throw status(409, { error: LOCKED_MESSAGE });
    }
    void runCorpusSync().catch(() => {
      /* errors already recorded in status via finishCorpusOp(err) */
    });
    return status(202, { ok: true as const });
  }

  static events() {
    return corpusEventStream();
  }
}
