/**
 * Knowledge-parents DAL. Owns the `kb_parents` table.
 *
 * Internal to the knowledge module: `pages.dal.ts` (atomic page write) and
 * the `pages/service.ts` inspect path (`Page.findById`) import it.
 */

import { type SQL, sql } from "bun";

export type ParentRow = {
  id: string;
  parent_index: number;
  text: string | null;
};

export type ParentInsert = {
  id: string;
  pageId: string;
  parentIndex: number;
  text: string;
  /** `kb_pages.content_hash` this tree was built from. */
  sourcePageHash: string;
};

/** Parent rows for one page, ordered by `parent_index`. */
export async function findParentsByPage(
  knowledgeBaseId: string,
  pageId: string,
): Promise<ParentRow[]> {
  return sql<ParentRow[]>`
    SELECT id, parent_index, text
    FROM kb_parents
    WHERE knowledge_base_id = ${knowledgeBaseId} AND page_id = ${pageId}
    ORDER BY parent_index
  `;
}

/** Replace all parent rows for a page inside the caller's transaction. */
export async function replaceParents(
  tx: SQL,
  knowledgeBaseId: string,
  pageId: string,
  rows: ParentInsert[],
): Promise<void> {
  await tx`
    DELETE FROM kb_parents
    WHERE knowledge_base_id = ${knowledgeBaseId} AND page_id = ${pageId}
  `;
  for (const row of rows) {
    await tx`
      INSERT INTO kb_parents (
        knowledge_base_id, id, page_id, parent_index, text, source_page_hash
      )
      VALUES (
        ${knowledgeBaseId},
        ${row.id},
        ${row.pageId},
        ${row.parentIndex},
        ${row.text},
        ${row.sourcePageHash}
      )
    `;
  }
}
