/**
 * Corpus-settings domain. Single row `kb_corpus_settings` id `default`;
 * nulls stay null (the walker applies `CORPUS_DEFAULTS` when it needs a
 * concrete value).
 */

import {
  findCorpusSettings,
  upsertCorpusLastSyncedSha,
  upsertCorpusRemoteSettings,
} from "./dal.ts";
import {
  type CorpusSettingsRow,
  normalizeDocsRoot,
  type StoredCorpusSettings,
  storedCorpusSettings,
} from "./defaults.ts";

function blankToNull(value: string | null | undefined): string | null {
  if (value == null) return null;
  const t = value.trim();
  return t === "" ? null : t;
}

export abstract class CorpusSettings {
  /** Load `kb_corpus_settings` id `default`. Nulls stay null. */
  static async load(): Promise<StoredCorpusSettings> {
    return storedCorpusSettings(await findCorpusSettings());
  }

  /** Upsert `kb_corpus_settings` id `default`. Empty strings stored as null. */
  static async save(row: CorpusSettingsRow): Promise<StoredCorpusSettings> {
    await upsertCorpusRemoteSettings({
      repoUrl: blankToNull(row.repoUrl),
      branch: blankToNull(row.branch),
      docsRoot: normalizeDocsRoot(row.docsRoot) ?? null,
    });
    return CorpusSettings.load();
  }

  /** Record `last_synced_sha` after clone/pull. Does not change remote fields. */
  static async saveLastSyncedSha(sha: string): Promise<StoredCorpusSettings> {
    await upsertCorpusLastSyncedSha(sha);
    return CorpusSettings.load();
  }
}
