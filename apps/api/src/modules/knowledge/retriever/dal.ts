/**
 * Retriever DAL. Owns the read queries behind retrieval: the child vector scan
 * and the parent/page lookup. Each query binds one knowledge base.
 */

import { sql } from "bun";

export type ChildVectorHitRow = {
  child_id: string;
  parent_id: string;
  page_id: string;
  child_text: string | null;
  score: number | string;
};

export type ParentLookupRow = {
  id: string;
  page_id: string;
  text: string | null;
  title: string | null;
};

export type ImageDescriptionHitRow = {
  page_id: string;
  image_path: string;
  description: string | null;
  title: string | null;
  score: number | string;
};

/** Top-K children by cosine distance within one knowledge base. */
export async function scanChildVectors(args: {
  knowledgeBaseId: string;
  currentModel: string;
  embeddingLiteral: string;
  limit: number;
}): Promise<ChildVectorHitRow[]> {
  return sql<ChildVectorHitRow[]>`
    SELECT
      c.id AS child_id,
      c.parent_id,
      c.page_id,
      c.text AS child_text,
      1 - (c.embedding <=> ${args.embeddingLiteral}::vector) AS score
    FROM kb_children c
    WHERE c.embedding IS NOT NULL
      AND c.embedding_model IS NOT DISTINCT FROM ${args.currentModel}
      AND c.knowledge_base_id = ${args.knowledgeBaseId}
    ORDER BY c.embedding <=> ${args.embeddingLiteral}::vector
    LIMIT ${args.limit}
  `;
}

/** Parent text + page title for a set of parent ids within one knowledge base. */
export async function findParentsByIds(
  knowledgeBaseId: string,
  parentIds: string[],
): Promise<ParentLookupRow[]> {
  return sql<ParentLookupRow[]>`
    SELECT p.id, p.page_id, p.text, pg.title
    FROM kb_parents p
    JOIN kb_pages pg
      ON pg.knowledge_base_id = p.knowledge_base_id
     AND pg.id = p.page_id
    WHERE p.knowledge_base_id = ${knowledgeBaseId}
      AND p.id = ANY(${sql.array(parentIds, "text[]")})
  `;
}

/**
 * Top-K image descriptions by cosine distance within one knowledge base,
 * each with its page title. `policies` names the searchable stored values.
 * @see docs/modern-knowledge-base-design/04-retrieval.md
 */
export async function scanImageDescriptionVectors(args: {
  knowledgeBaseId: string;
  currentModel: string;
  embeddingLiteral: string;
  limit: number;
  policies: string[];
}): Promise<ImageDescriptionHitRow[]> {
  return sql<ImageDescriptionHitRow[]>`
    SELECT
      d.page_id,
      d.image_path,
      d.description,
      pg.title,
      1 - (d.embedding <=> ${args.embeddingLiteral}::vector) AS score
    FROM kb_image_descriptions d
    JOIN kb_pages pg
      ON pg.knowledge_base_id = d.knowledge_base_id
     AND pg.id = d.page_id
    WHERE d.embedding IS NOT NULL
      AND d.embedding_model IS NOT DISTINCT FROM ${args.currentModel}
      AND d.knowledge_base_id = ${args.knowledgeBaseId}
      AND d.policy = ANY(${sql.array(args.policies, "text[]")})
    ORDER BY d.embedding <=> ${args.embeddingLiteral}::vector
    LIMIT ${args.limit}
  `;
}
