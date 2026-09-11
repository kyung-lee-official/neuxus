/**
 * Retriever-settings DAL. Owns the `kb_retrieve_settings` singleton row
 * (id `default`).
 *
 * Internal to the settings sub-module: only `service.ts` imports it.
 */

import { getPrisma } from "../../../../shared/db.ts";

const SETTINGS_ID = "default";

/** Raw `kb_retrieve_settings` row (id `default`), columns verbatim. */
export type RetrieveSettingsRecord = {
  childLimit: number | null;
  maxParents: number | null;
  maxCharacters: number | null;
};

/** Load `kb_retrieve_settings` id `default`, or null when no row exists. */
export async function findRetrieveSettings(): Promise<RetrieveSettingsRecord | null> {
  const row = await getPrisma().knowledgeRetrieveSettings.findUnique({
    where: { id: SETTINGS_ID },
  });
  if (!row) return null;
  return {
    childLimit: row.childLimit,
    maxParents: row.maxParents,
    maxCharacters: row.maxCharacters,
  };
}

/** Upsert `kb_retrieve_settings` id `default`. */
export async function upsertRetrieveSettings(fields: {
  childLimit: number | null;
  maxParents: number | null;
  maxCharacters: number | null;
}): Promise<void> {
  await getPrisma().knowledgeRetrieveSettings.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID, ...fields },
    update: { ...fields },
  });
}
