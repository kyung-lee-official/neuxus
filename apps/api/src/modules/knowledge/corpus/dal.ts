/**
 * Corpus DAL. Owns the corpus persistence tables: `kb_corpus_settings`
 * (singleton row) and the `kb_pages` / `kb_parents` / `kb_children` chunk rows.
 *
 * Internal to the corpus module: the domain files (`settings.ts`,
 * `rechunk.ts`) import it; nothing outside the module does.
 */

import { getPrisma } from "../../../shared/db.ts";

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

/** Page id + body for every `kb_pages` row. */
export async function listPageBodies(): Promise<
  { id: string; body: string }[]
> {
  return getPrisma().knowledgePage.findMany({
    select: { id: true, body: true },
  });
}

export type CorpusParentRow = {
  id: string;
  pageId: string;
  parentIndex: number;
  text: string;
  startOffset: number;
  endOffset: number;
};

export type CorpusChildRow = {
  id: string;
  parentId: string;
  pageId: string;
  childIndex: number;
  text: string;
  startOffset: number;
  endOffset: number;
};

/** Replace one page's `kb_parents`/`kb_children` rows in a transaction. */
export async function replacePageChunks(
  pageId: string,
  parents: CorpusParentRow[],
  children: CorpusChildRow[],
): Promise<void> {
  await getPrisma().$transaction(async (tx) => {
    await tx.knowledgeParent.deleteMany({ where: { pageId } });
    if (parents.length > 0) {
      await tx.knowledgeParent.createMany({ data: parents });
    }
    if (children.length > 0) {
      await tx.knowledgeChild.createMany({ data: children });
    }
  });
}
