/**
 * Chunkify-settings DAL. Owns the `kb_chunk_settings` table (one row per
 * knowledge base, keyed by `knowledge_base_id`).
 *
 * Internal to the settings sub-module: only `service.ts` imports it.
 */

import { getPrisma } from "../../../../shared/db.ts";

/** Raw `kb_chunk_settings` row, columns verbatim. */
export type ChunkSettingsRecord = {
  childTargetTokens: number | null;
  childHardMaxTokens: number | null;
  childOverlapTokens: number | null;
  childCrumbMinTokens: number | null;
  parentMaxTokens: number | null;
  fenceIntroGlueMaxTokens: number | null;
  tokenizerEncoding: string | null;
};

/** Load the chunkify knobs for one knowledge base, or null when unset. */
export async function findChunkSettings(
  knowledgeBaseId: string,
): Promise<ChunkSettingsRecord | null> {
  const row = await getPrisma().knowledgeChunkSettings.findUnique({
    where: { knowledgeBaseId },
  });
  if (!row) return null;
  return {
    childTargetTokens: row.childTargetTokens,
    childHardMaxTokens: row.childHardMaxTokens,
    childOverlapTokens: row.childOverlapTokens,
    childCrumbMinTokens: row.childCrumbMinTokens,
    parentMaxTokens: row.parentMaxTokens,
    fenceIntroGlueMaxTokens: row.fenceIntroGlueMaxTokens,
    tokenizerEncoding: row.tokenizerEncoding,
  };
}

/** Upsert the chunkify knobs for one knowledge base. */
export async function upsertChunkSettings(
  knowledgeBaseId: string,
  fields: ChunkSettingsRecord,
): Promise<void> {
  await getPrisma().knowledgeChunkSettings.upsert({
    where: { knowledgeBaseId },
    create: { knowledgeBaseId, ...fields },
    update: { ...fields },
  });
}
