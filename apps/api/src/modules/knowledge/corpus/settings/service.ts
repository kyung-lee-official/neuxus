/**
 * Corpus-settings domain. One row per knowledge base (`kb_corpus_settings`,
 * keyed by `knowledge_base_id`); nulls stay null (the walker applies
 * `CORPUS_DEFAULTS` when it needs a concrete value).
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
} from "./defaults.ts";

function blankToNull(value: string | null | undefined): string | null {
  if (value == null) return null;
  const t = value.trim();
  return t === "" ? null : t;
}

export abstract class CorpusSettings {
  /** Load the corpus settings for one knowledge base. Nulls stay null. */
  static async load(knowledgeBaseId: string): Promise<StoredCorpusSettings> {
    return (
      (await findCorpusSettings(knowledgeBaseId)) ?? {
        repoUrl: null,
        branch: null,
        docsRoot: null,
        lastSyncedSha: null,
      }
    );
  }

  /** Upsert the remote fields for one knowledge base. Empty strings stored as null. */
  static async save(
    knowledgeBaseId: string,
    row: CorpusSettingsRow,
  ): Promise<StoredCorpusSettings> {
    await upsertCorpusRemoteSettings(knowledgeBaseId, {
      repoUrl: blankToNull(row.repoUrl),
      branch: blankToNull(row.branch),
      docsRoot: normalizeDocsRoot(row.docsRoot) ?? null,
    });
    return CorpusSettings.load(knowledgeBaseId);
  }

  /** Record `last_synced_sha` after clone/pull. Does not change remote fields. */
  static async saveLastSyncedSha(
    knowledgeBaseId: string,
    sha: string,
  ): Promise<StoredCorpusSettings> {
    await upsertCorpusLastSyncedSha(knowledgeBaseId, sha);
    return CorpusSettings.load(knowledgeBaseId);
  }
}
