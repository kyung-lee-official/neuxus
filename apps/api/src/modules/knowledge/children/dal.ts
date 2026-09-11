/**
 * Knowledge-children DAL. Owns the `kb_children` table.
 *
 * Internal to the pages sub-module: `pages/dal.ts` (atomic page write) and
 * `pages/get.ts` (inspect) import it.
 */

import { type SQL, sql } from "bun";

export type ChildRow = {
  id: string;
  parent_id: string;
  child_index: number;
  text: string | null;
  start_offset: number | null;
  end_offset: number | null;
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
  startOffset: number;
  endOffset: number;
};

/** Child rows for one page, ordered by `child_index`. */
export async function findChildrenByPage(pageId: string): Promise<ChildRow[]> {
  return sql<ChildRow[]>`
    SELECT
      id,
      parent_id,
      child_index,
      text,
      start_offset,
      end_offset,
      embedding_model,
      embedded_at,
      (embedding IS NOT NULL) AS embedded
    FROM kb_children
    WHERE page_id = ${pageId}
    ORDER BY child_index
  `;
}

/** Replace all child rows for a page inside the caller's transaction. */
export async function replaceChildren(
  tx: SQL,
  pageId: string,
  rows: ChildInsert[],
): Promise<void> {
  await tx`DELETE FROM kb_children WHERE page_id = ${pageId}`;
  for (const row of rows) {
    await tx`
      INSERT INTO kb_children (
        id, parent_id, page_id, child_index, text, start_offset, end_offset
      )
      VALUES (
        ${row.id},
        ${row.parentId},
        ${row.pageId},
        ${row.childIndex},
        ${row.text},
        ${row.startOffset},
        ${row.endOffset}
      )
    `;
  }
}
