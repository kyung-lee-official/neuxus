/**
 * Embedder DAL. Owns the `kb_children` embedding pass: which children need a
 * vector, and writing the pgvector back.
 */

import { sql } from "bun";
import { getPrisma } from "../../../shared/db.ts";

export type ChildToEmbed = {
  knowledgeBaseId: string;
  id: string;
  text: string;
};

/**
 * Children whose `embedding_model` is missing or differs from `currentModel`,
 * optionally scoped to one knowledge base and/or page.
 */
export async function findChildrenNeedingEmbedding(
  currentModel: string,
  scope: { knowledgeBaseId?: string; pageId?: string } = {},
): Promise<ChildToEmbed[]> {
  const rows = await getPrisma().knowledgeChild.findMany({
    where: {
      ...(scope.knowledgeBaseId
        ? { knowledgeBaseId: scope.knowledgeBaseId }
        : {}),
      ...(scope.pageId ? { pageId: scope.pageId } : {}),
      // `embedding IS NULL` ⇒ `embeddingModel IS NULL` (always set together);
      // otherwise pick up stale rows whose model differs.
      OR: [{ embeddingModel: null }, { embeddingModel: { not: currentModel } }],
    },
    select: { knowledgeBaseId: true, id: true, text: true },
  });
  return rows.map((row) => ({
    knowledgeBaseId: row.knowledgeBaseId,
    id: row.id,
    text: row.text ?? "",
  }));
}

/** Write one child's pgvector + model stamp. */
export async function writeChildEmbedding(
  knowledgeBaseId: string,
  childId: string,
  embeddingLiteral: string,
  model: string,
): Promise<void> {
  await sql`
    UPDATE kb_children
    SET
      embedding = ${embeddingLiteral}::vector,
      embedding_model = ${model},
      embedded_at = NOW()
    WHERE knowledge_base_id = ${knowledgeBaseId} AND id = ${childId}
  `;
}
