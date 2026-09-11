/**
 * Corpus chunk DAL. Owns the `kb_pages` / `kb_parents` / `kb_children`
 * chunk rows used by rechunk.
 *
 * Internal to the corpus module: `rechunk.ts` imports it.
 */

import { getPrisma } from "../../../shared/db.ts";

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
