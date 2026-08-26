import { chunkify } from "../chunkify/chunkify.ts";
import { getPrisma } from "../db.ts";

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
  const prisma = getPrisma();
  const pages = await prisma.knowledgePage.findMany({
    select: { id: true, body: true },
  });

  let pagesProcessed = 0;
  let pagesSkipped = 0;

  for (const page of pages) {
    const chunks = chunkify(page.body);
    const parentRows = chunks.parents.map((parent) => {
      const id = `${page.id}:p:${parent.index}`;
      return {
        id,
        pageId: page.id,
        parentIndex: parent.index,
        text: parent.text,
        startOffset: parent.start,
        endOffset: parent.end,
      };
    });
    const childRows = chunks.children.map((child) => {
      const parentId = `${page.id}:p:${child.parentIndex}`;
      return {
        id: `${parentId}:c:${child.index}`,
        parentId,
        pageId: page.id,
        childIndex: child.index,
        text: child.text,
        startOffset: child.start,
        endOffset: child.end,
      };
    });

    await prisma.$transaction(async (tx) => {
      await tx.knowledgeParent.deleteMany({ where: { pageId: page.id } });
      if (parentRows.length > 0) {
        await tx.knowledgeParent.createMany({ data: parentRows });
      }
      if (childRows.length > 0) {
        await tx.knowledgeChild.createMany({ data: childRows });
      }
    });

    pagesProcessed += 1;
    if (chunks.parents.length === 0) pagesSkipped += 1;
  }

  return { pagesProcessed, pagesSkipped };
}
