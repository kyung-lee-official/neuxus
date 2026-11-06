/**
 * Retriever DAL. Owns the read queries behind retrieval: the child vector scan,
 * the parent/page lookup, and the image-description scan.
 *
 * These functions are storage-only: they accept knowledge-base ids, return
 * rows, and perform no ranking, merging, deduplication, caps, or warnings.
 */

import { sql } from "bun";

export type ChildVectorHitRow = {
  knowledge_base_id: string;
  child_id: string;
  parent_id: string;
  page_id: string;
  child_text: string | null;
  score: number | string;
};

export type ParentKey = {
  knowledgeBaseId: string;
  parentId: string;
};

export type ParentLookupRow = {
  knowledge_base_id: string;
  id: string;
  page_id: string;
  text: string | null;
  title: string | null;
};

export type ImageDescriptionHitRow = {
  knowledge_base_id: string;
  page_id: string;
  image_path: string;
  description: string | null;
  title: string | null;
  score: number | string;
};

/**
 * Top-K children by cosine distance across the supplied knowledge bases.
 * `limit` is a storage/query limit; the caller owns any higher-level cap.
 */
export async function scanChildVectors(args: {
  knowledgeBaseIds: string[];
  currentModel: string;
  embeddingLiteral: string;
  limit: number;
}): Promise<ChildVectorHitRow[]> {
  if (args.knowledgeBaseIds.length === 0) return [];

  return sql<ChildVectorHitRow[]>`
    SELECT
      c.knowledge_base_id,
      c.id AS child_id,
      c.parent_id,
      c.page_id,
      c.text AS child_text,
      1 - (c.embedding <=> ${args.embeddingLiteral}::vector) AS score
    FROM kb_children c
    WHERE c.embedding IS NOT NULL
      AND c.embedding_model IS NOT DISTINCT FROM ${args.currentModel}
      AND c.knowledge_base_id = ANY(${sql.array(args.knowledgeBaseIds, "text[]")})
    ORDER BY c.embedding <=> ${args.embeddingLiteral}::vector
    LIMIT ${args.limit}
  `;
}

/**
 * Parent text and page title for the supplied `(knowledgeBaseId, parentId)`
 * pairs. Parent ids are scoped to their knowledge base, so the lookup uses the
 * composite key rather than bare ids.
 */
export async function findParentsByIds(
  keys: ParentKey[],
): Promise<ParentLookupRow[]> {
  if (keys.length === 0) return [];

  const knowledgeBaseIds = keys.map((key) => key.knowledgeBaseId);
  const parentIds = keys.map((key) => key.parentId);

  return sql<ParentLookupRow[]>`
    SELECT p.knowledge_base_id, p.id, p.page_id, p.text, pg.title
    FROM kb_parents p
    JOIN kb_pages pg
      ON pg.knowledge_base_id = p.knowledge_base_id
     AND pg.id = p.page_id
    JOIN unnest(
      ${sql.array(knowledgeBaseIds, "text[]")},
      ${sql.array(parentIds, "text[]")}
    ) AS k(knowledge_base_id, parent_id)
      ON p.knowledge_base_id = k.knowledge_base_id
     AND p.id = k.parent_id
  `;
}

/**
 * Top-3 image descriptions by cosine distance across the supplied knowledge
 * bases, each with its page title. The hardcoded limit is a storage/query
 * limit; the caller owns the global image cap.
 *
 * `policies` names the searchable stored values.
 *
 * @see docs/modern-knowledge-base-design/04-retrieval.md
 */
export async function scanImageDescriptionVectors(args: {
  knowledgeBaseIds: string[];
  currentModel: string;
  embeddingLiteral: string;
  policies: string[];
}): Promise<ImageDescriptionHitRow[]> {
  if (args.knowledgeBaseIds.length === 0) return [];

  return sql<ImageDescriptionHitRow[]>`
    SELECT
      d.knowledge_base_id,
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
      AND d.knowledge_base_id = ANY(${sql.array(args.knowledgeBaseIds, "text[]")})
      AND d.policy = ANY(${sql.array(args.policies, "text[]")})
    ORDER BY d.embedding <=> ${args.embeddingLiteral}::vector
    LIMIT 3
  `;
}
