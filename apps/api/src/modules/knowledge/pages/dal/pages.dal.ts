/**
 * Knowledge-pages DAL. Owns the `kb_pages` table (and its chunk-tree
 * transaction, delegating the parent/child statements to the sibling dals).
 *
 * Internal to the knowledge module: `pages/service.ts` imports it.
 */

import { type SQL, sql } from "bun";
import type { ChunkifyResult } from "../../chunkifier/index.ts";
import { type ChildInsert, replaceChildren } from "./children.dal.ts";
import { type ParentInsert, replaceParents } from "./parents.dal.ts";

export type PageSummaryRow = {
  knowledge_base_id: string;
  id: string;
  title: string | null;
  tags: string[];
  source_path: string | null;
  content_hash: string | null;
  updated_at: Date | null;
  parent_count: number;
  child_count: number;
};

export type PageDetailRow = {
  knowledge_base_id: string;
  id: string;
  title: string | null;
  tags: string[];
  body: string | null;
  source_path: string | null;
  content_hash: string | null;
  meta_hash: string | null;
  updated_at: Date | null;
};

/**
 * All `kb_pages` of one knowledge base with parent/child counts. No `body`.
 * The counts read `kb_parents`/`kb_children` as aggregates for the listing.
 */
export async function listPageSummaries(
  knowledgeBaseId: string,
): Promise<PageSummaryRow[]> {
  return sql<PageSummaryRow[]>`
    SELECT
      p.knowledge_base_id,
      p.id,
      p.title,
      p.tags,
      p.source_path,
      p.content_hash,
      p.updated_at,
      (
        SELECT COUNT(*)::int FROM kb_parents
        WHERE knowledge_base_id = p.knowledge_base_id AND page_id = p.id
      ) AS parent_count,
      (
        SELECT COUNT(*)::int FROM kb_children
        WHERE knowledge_base_id = p.knowledge_base_id AND page_id = p.id
      ) AS child_count
    FROM kb_pages p
    WHERE p.knowledge_base_id = ${knowledgeBaseId}
    ORDER BY p.source_path, p.id
  `;
}

/** Page id + body + content_hash for one knowledge base (rechunk input). */
export async function listPageBodies(
  knowledgeBaseId: string,
): Promise<{ id: string; body: string; content_hash: string }[]> {
  return sql<{ id: string; body: string; content_hash: string }[]>`
    SELECT id, body, content_hash FROM kb_pages
    WHERE knowledge_base_id = ${knowledgeBaseId}
  `;
}

/** One `kb_pages` row including `body`, or null when missing. */
export async function findPageDetailRow(
  knowledgeBaseId: string,
  pageId: string,
): Promise<PageDetailRow | null> {
  const rows = await sql<PageDetailRow[]>`
    SELECT
      knowledge_base_id, id, title, tags, body, source_path, content_hash,
      meta_hash, updated_at
    FROM kb_pages
    WHERE knowledge_base_id = ${knowledgeBaseId} AND id = ${pageId}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

export type PageHashRow = {
  content_hash: string;
  meta_hash: string | null;
};

/** Stored `(content_hash, meta_hash)` for a page, or null when it is missing. */
export async function findPageHashes(
  knowledgeBaseId: string,
  pageId: string,
): Promise<PageHashRow | null> {
  const rows = await sql<PageHashRow[]>`
    SELECT content_hash, meta_hash FROM kb_pages
    WHERE knowledge_base_id = ${knowledgeBaseId} AND id = ${pageId}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

export type UpsertPageWithChunksInput = {
  knowledgeBaseId: string;
  id: string;
  title: string;
  tags: string[];
  body: string;
  sourcePath: string | null;
  contentHash: string;
  metaHash: string | null;
  chunks: ChunkifyResult;
};

/**
 * Upsert one `kb_pages` row and replace its parent/child tree atomically.
 * The transaction is opened here; the `kb_parents`/`kb_children` statements
 * live in the `parents`/`children` dals and receive this transaction.
 */
export async function upsertPageWithChunks(
  input: UpsertPageWithChunksInput,
): Promise<void> {
  const parentRows: ParentInsert[] = input.chunks.parents.map((parent) => ({
    id: `${input.id}:p:${parent.index}`,
    pageId: input.id,
    parentIndex: parent.index,
    text: parent.text,
    sourcePageHash: input.contentHash,
  }));

  const childRows: ChildInsert[] = input.chunks.children.map((child) => {
    const parentId = `${input.id}:p:${child.parentIndex}`;
    return {
      id: `${parentId}:c:${child.index}`,
      parentId,
      pageId: input.id,
      childIndex: child.index,
      text: child.text,
    };
  });

  await sql.begin(async (tx) => {
    await upsertPageRow(tx, input);
    await replaceParents(tx, input.knowledgeBaseId, input.id, parentRows);
    await replaceChildren(tx, input.knowledgeBaseId, input.id, childRows);
  });
}

/** Upsert the `kb_pages` row inside the caller's transaction. */
async function upsertPageRow(
  tx: SQL,
  input: UpsertPageWithChunksInput,
): Promise<void> {
  await tx`
    INSERT INTO kb_pages (
      knowledge_base_id, id, title, tags, body, source_path, content_hash,
      meta_hash, updated_at
    )
    VALUES (
      ${input.knowledgeBaseId},
      ${input.id},
      ${input.title},
      ${tx.array(input.tags)}::text[],
      ${input.body},
      ${input.sourcePath},
      ${input.contentHash},
      ${input.metaHash},
      NOW()
    )
    ON CONFLICT (knowledge_base_id, id) DO UPDATE SET
      title = EXCLUDED.title,
      tags = EXCLUDED.tags,
      body = EXCLUDED.body,
      source_path = EXCLUDED.source_path,
      content_hash = EXCLUDED.content_hash,
      meta_hash = EXCLUDED.meta_hash,
      updated_at = NOW()
  `;
}

/** Replace one page's parent/child tree in a transaction (no `kb_pages` write). */
export async function replacePageChunks(
  knowledgeBaseId: string,
  pageId: string,
  parents: ParentInsert[],
  children: ChildInsert[],
): Promise<void> {
  await sql.begin(async (tx) => {
    await replaceParents(tx, knowledgeBaseId, pageId, parents);
    await replaceChildren(tx, knowledgeBaseId, pageId, children);
  });
}

/**
 * Drop one knowledge base's corpus pages whose `source_path` is not in the
 * current walker list. Rows with null `source_path` are left alone.
 */
export async function deletePagesMissingSourcePaths(
  knowledgeBaseId: string,
  keepSourcePaths: string[],
): Promise<void> {
  if (keepSourcePaths.length === 0) {
    await sql`
      DELETE FROM kb_pages
      WHERE knowledge_base_id = ${knowledgeBaseId} AND source_path IS NOT NULL
    `;
    return;
  }
  await sql`
    DELETE FROM kb_pages
    WHERE knowledge_base_id = ${knowledgeBaseId}
      AND source_path IS NOT NULL
      AND NOT (source_path = ANY(${sql.array(keepSourcePaths)}::text[]))
  `;
}
