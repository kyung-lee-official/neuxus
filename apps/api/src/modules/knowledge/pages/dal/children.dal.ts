/**
 * Knowledge-children DAL. Owns the `kb_children` table.
 *
 * Internal to the knowledge module: `pages.dal.ts` (atomic page write) and
 * the `pages/service.ts` inspect path (`Page.findById`) import it.
 */

import { type SQL, sql } from "bun";

export type ChildRow = {
  id: string;
  parent_id: string;
  child_index: number;
  text: string | null;
  embedding_model: string | null;
  embedded_at: Date | null;
  embedded: boolean;
};

export type ChildInsert = {
  id: string;
  parentId: string;
  pageId: string;
  childIndex: number;
  text: string;
};

/** Child rows for one page, ordered by `parent_id`, `child_index`. */
export async function findChildrenByPage(
  knowledgeBaseId: string,
  pageId: string,
): Promise<ChildRow[]> {
  return sql<ChildRow[]>`
    SELECT
      id,
      parent_id,
      child_index,
      text,
      embedding_model,
      embedded_at,
      (embedding IS NOT NULL) AS embedded
    FROM kb_children
    WHERE knowledge_base_id = ${knowledgeBaseId} AND page_id = ${pageId}
    ORDER BY parent_id, child_index
  `;
}

/** Replace all child rows for a page inside the caller's transaction. */
export async function replaceChildren(
  tx: SQL,
  knowledgeBaseId: string,
  pageId: string,
  rows: ChildInsert[],
): Promise<void> {
  await tx`
    DELETE FROM kb_children
    WHERE knowledge_base_id = ${knowledgeBaseId} AND page_id = ${pageId}
  `;
  for (const row of rows) {
    await tx`
      INSERT INTO kb_children (
        knowledge_base_id, id, parent_id, page_id, child_index, text
      )
      VALUES (
        ${knowledgeBaseId},
        ${row.id},
        ${row.parentId},
        ${row.pageId},
        ${row.childIndex},
        ${row.text}
      )
    `;
  }
}
