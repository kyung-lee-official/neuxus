/**
 * Corpus-settings DAL. Owns the `kb_corpus_settings` singleton row
 * (id `default`).
 *
 * Internal to the settings sub-module: only `service.ts` imports it.
 */

import { getPrisma } from "../../../../shared/db.ts";

const SETTINGS_ID = "default";

/** Raw `kb_corpus_settings` row (id `default`), columns verbatim. */
export type CorpusSettingsRecord = {
  repoUrl: string | null;
  branch: string | null;
  docsRoot: string | null;
  lastSyncedSha: string | null;
};

/** Load `kb_corpus_settings` id `default`, or null when no row exists. */
export async function findCorpusSettings(): Promise<CorpusSettingsRecord | null> {
  const row = await getPrisma().knowledgeCorpusSettings.findUnique({
    where: { id: SETTINGS_ID },
  });
  if (!row) return null;
  return {
    repoUrl: row.repoUrl,
    branch: row.branch,
    docsRoot: row.docsRoot,
    lastSyncedSha: row.lastSyncedSha,
  };
}

/** Upsert the remote fields of `kb_corpus_settings` id `default`. */
export async function upsertCorpusRemoteSettings(fields: {
  repoUrl: string | null;
  branch: string | null;
  docsRoot: string | null;
}): Promise<void> {
  await getPrisma().knowledgeCorpusSettings.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID, ...fields },
    update: { ...fields },
  });
}

/** Record `last_synced_sha` without touching the remote fields. */
export async function upsertCorpusLastSyncedSha(sha: string): Promise<void> {
  await getPrisma().knowledgeCorpusSettings.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID, lastSyncedSha: sha },
    update: { lastSyncedSha: sha },
  });
}
