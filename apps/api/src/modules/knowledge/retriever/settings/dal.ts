/**
 * Retriever-settings DAL. Owns the `kb_retrieve_settings` table (one row per
 * knowledge base, keyed by `knowledge_base_id`).
 *
 * Internal to the settings sub-module: only `service.ts` imports it.
 */

import { getPrisma } from "../../../../shared/db.ts";

/** Raw `kb_retrieve_settings` row, columns verbatim. */
export type RetrieveSettingsRecord = {
  childLimit: number | null;
  maxParents: number | null;
  maxCharacters: number | null;
};

/** Load the retrieval settings for one knowledge base, or null when unset. */
export async function findRetrieveSettings(
  knowledgeBaseId: string,
): Promise<RetrieveSettingsRecord | null> {
  const row = await getPrisma().knowledgeRetrieveSettings.findUnique({
    where: { knowledgeBaseId },
  });
  if (!row) return null;
  return {
    childLimit: row.childLimit,
    maxParents: row.maxParents,
    maxCharacters: row.maxCharacters,
  };
}

/** Upsert the retrieval settings for one knowledge base. */
export async function upsertRetrieveSettings(
  knowledgeBaseId: string,
  fields: {
    childLimit: number | null;
    maxParents: number | null;
    maxCharacters: number | null;
  },
): Promise<void> {
  await getPrisma().knowledgeRetrieveSettings.upsert({
    where: { knowledgeBaseId },
    create: { knowledgeBaseId, ...fields },
    update: { ...fields },
  });
}
