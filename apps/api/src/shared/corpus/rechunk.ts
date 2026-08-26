import { sql } from "bun";
import { chunkify } from "../chunkify/chunkify.ts";

type PageRow = {
  id: string;
  body: string;
};

/**
 * Re-chunk every page in `kb_pages`. Replaces each page's `kb_parents` and
 * `kb_children` rows with the chunkify result for that page's current body.
 *
 * Embeddings for the old children become stale (rows are deleted, fresh rows
 * have null embedding) — call {@link runCorpusEmbed} (or a full Sync) to
 * fill them in.
 */
export async function rechunkAllPages(): Promise<{
  pagesProcessed: number;
  pagesSkipped: number;
}> {
  const rows = await sql<PageRow[]>`
    SELECT id, body FROM kb_pages
  `;

  let pagesProcessed = 0;
  let pagesSkipped = 0;

  for (const row of rows) {
    const chunks = chunkify(row.body);
    await sql.begin(async (tx) => {
      await tx`DELETE FROM kb_parents WHERE page_id = ${row.id}`;
      for (const parent of chunks.parents) {
        const parentId = `${row.id}:p:${parent.index}`;
        await tx`
          INSERT INTO kb_parents (
            id, page_id, parent_index, text, start_offset, end_offset
          )
          VALUES (
            ${parentId},
            ${row.id},
            ${parent.index},
            ${parent.text},
            ${parent.start},
            ${parent.end}
          )
        `;
      }
      for (const child of chunks.children) {
        const parentId = `${row.id}:p:${child.parentIndex}`;
        const childId = `${parentId}:c:${child.index}`;
        await tx`
          INSERT INTO kb_children (
            id, parent_id, page_id, child_index, text, start_offset, end_offset
          )
          VALUES (
            ${childId},
            ${parentId},
            ${row.id},
            ${child.index},
            ${child.text},
            ${child.start},
            ${child.end}
          )
        `;
      }
    });
    pagesProcessed += 1;
    if (chunks.parents.length === 0) pagesSkipped += 1;
  }

  return { pagesProcessed, pagesSkipped };
}
