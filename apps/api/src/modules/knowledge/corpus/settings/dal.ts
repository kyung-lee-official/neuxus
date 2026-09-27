/**
 * Corpus-settings DAL. Owns the `kb_corpus_settings` table (one row per
 * knowledge base, keyed by `knowledge_base_id`).
 *
 * Internal to the settings sub-module: only `service.ts` imports it.
 */

import { getPrisma } from "../../../../shared/db.ts";
import type { StoredCorpusSettings } from "./defaults.ts";

/** Load the corpus settings for one knowledge base, or null when unset. */
export async function findCorpusSettings(
  knowledgeBaseId: string,
): Promise<StoredCorpusSettings | null> {
  const row = await getPrisma().knowledgeCorpusSettings.findUnique({
    where: { knowledgeBaseId },
  });
  if (!row) return null;
  return {
    repoUrl: row.repoUrl,
    branch: row.branch,
    docsRoot: row.docsRoot,
    lastSyncedSha: row.lastSyncedSha,
  };
}

/** Upsert the remote fields for one knowledge base. */
export async function upsertCorpusRemoteSettings(
  knowledgeBaseId: string,
  fields: {
    repoUrl: string | null;
    branch: string | null;
    docsRoot: string | null;
  },
): Promise<void> {
  await getPrisma().knowledgeCorpusSettings.upsert({
    where: { knowledgeBaseId },
    create: { knowledgeBaseId, ...fields },
    update: { ...fields },
  });
}

/** Record `last_synced_sha` without touching the remote fields. */
export async function upsertCorpusLastSyncedSha(
  knowledgeBaseId: string,
  sha: string,
): Promise<void> {
  await getPrisma().knowledgeCorpusSettings.upsert({
    where: { knowledgeBaseId },
    create: { knowledgeBaseId, lastSyncedSha: sha },
    update: { lastSyncedSha: sha },
  });
}
