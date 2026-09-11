/**
 * Knowledge-parents DAL. Owns the `kb_parents` table.
 *
 * Internal to the knowledge module: `pages.dal.ts` (atomic page write) and
 * the `pages/get.ts` inspect path import it.
 */

import { type SQL, sql } from "bun";

export type ParentRow = {
  id: string;
  parent_index: number;
  text: string | null;
  start_offset: number | null;
  end_offset: number | null;
};

export type ParentInsert = {
  id: string;
  pageId: string;
  parentIndex: number;
  text: string;
  startOffset: number;
  endOffset: number;
};

/** Parent rows for one page, ordered by `parent_index`. */
export async function findParentsByPage(pageId: string): Promise<ParentRow[]> {
  return sql<ParentRow[]>`
    SELECT id, parent_index, text, start_offset, end_offset
    FROM kb_parents
    WHERE page_id = ${pageId}
    ORDER BY parent_index
  `;
}

/** Replace all parent rows for a page inside the caller's transaction. */
export async function replaceParents(
  tx: SQL,
  pageId: string,
  rows: ParentInsert[],
): Promise<void> {
  await tx`DELETE FROM kb_parents WHERE page_id = ${pageId}`;
  for (const row of rows) {
    await tx`
      INSERT INTO kb_parents (
        id, page_id, parent_index, text, start_offset, end_offset
      )
      VALUES (
        ${row.id},
        ${row.pageId},
        ${row.parentIndex},
        ${row.text},
        ${row.startOffset},
        ${row.endOffset}
      )
    `;
  }
}
