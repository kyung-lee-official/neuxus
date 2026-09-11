/**
 * Knowledge-pages DAL. Owns the `kb_pages` table (and its chunk-tree
 * transaction, delegating the parent/child statements to the sibling dals).
 *
 * Internal to the pages sub-module: the domain files (`list.ts`, `get.ts`,
 * `persist.ts`) import it.
 */

import { type SQL, sql } from "bun";
import type { ChunkifyResult } from "../../../shared/chunkify/index.ts";
import { type ChildInsert, replaceChildren } from "../children/dal.ts";
import { type ParentInsert, replaceParents } from "../parents/dal.ts";

export type PageSummaryRow = {
  id: string;
  slug: string;
  title: string | null;
  type: string | null;
  tags: string[];
  source_path: string | null;
  content_hash: string | null;
  updated_at: Date | null;
  parent_count: number;
  child_count: number;
};

export type PageDetailRow = {
  id: string;
  slug: string;
  title: string | null;
  type: string | null;
  tags: string[];
  body: string | null;
  source_path: string | null;
  content_hash: string | null;
  updated_at: Date | null;
};

/**
 * All `kb_pages` with parent/child counts, ordered by slug. No `body`.
 * The counts read `kb_parents`/`kb_children` as aggregates for the listing.
 */
export async function listPageSummaries(): Promise<PageSummaryRow[]> {
  return sql<PageSummaryRow[]>`
    SELECT
      p.id,
      p.slug,
      p.title,
      p.type,
      p.tags,
      p.source_path,
      p.content_hash,
      p.updated_at,
      (
        SELECT COUNT(*)::int FROM kb_parents WHERE page_id = p.id
      ) AS parent_count,
      (
        SELECT COUNT(*)::int FROM kb_children WHERE page_id = p.id
      ) AS child_count
    FROM kb_pages p
    ORDER BY p.slug
  `;
}

/** One `kb_pages` row including `body`, or null when missing. */
export async function findPageDetailRow(
  pageId: string,
): Promise<PageDetailRow | null> {
  const rows = await sql<PageDetailRow[]>`
    SELECT
      id, slug, title, type, tags, body, source_path, content_hash, updated_at
    FROM kb_pages
    WHERE id = ${pageId}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

/** Stored `kb_pages.content_hash`, or null when the page is missing. */
export async function findPageContentHash(
  pageId: string,
): Promise<string | null> {
  const rows = await sql<{ content_hash: string | null }[]>`
    SELECT content_hash FROM kb_pages WHERE id = ${pageId} LIMIT 1
  `;
  const hash = rows[0]?.content_hash;
  return typeof hash === "string" ? hash : null;
}

export type UpsertPageWithChunksInput = {
  id: string;
  slug: string;
  title: string;
  type: string | null;
  tags: string[];
  body: string;
  sourcePath: string | null;
  contentHash: string;
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
    startOffset: parent.start,
    endOffset: parent.end,
  }));

  const childRows: ChildInsert[] = input.chunks.children.map((child) => {
    const parentId = `${input.id}:p:${child.parentIndex}`;
    return {
      id: `${parentId}:c:${child.index}`,
      parentId,
      pageId: input.id,
      childIndex: child.index,
      text: child.text,
      startOffset: child.start,
      endOffset: child.end,
    };
  });

  await sql.begin(async (tx) => {
    await upsertPageRow(tx, input);
    await replaceParents(tx, input.id, parentRows);
    await replaceChildren(tx, input.id, childRows);
  });
}

/** Upsert the `kb_pages` row inside the caller's transaction. */
async function upsertPageRow(
  tx: SQL,
  input: UpsertPageWithChunksInput,
): Promise<void> {
  await tx`
    INSERT INTO kb_pages (
      id, slug, title, type, tags, body, source_path, content_hash, updated_at
    )
    VALUES (
      ${input.id},
      ${input.slug},
      ${input.title},
      ${input.type},
      ${tx.array(input.tags)}::text[],
      ${input.body},
      ${input.sourcePath},
      ${input.contentHash},
      NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
      slug = EXCLUDED.slug,
      title = EXCLUDED.title,
      type = EXCLUDED.type,
      tags = EXCLUDED.tags,
      body = EXCLUDED.body,
      source_path = EXCLUDED.source_path,
      content_hash = EXCLUDED.content_hash,
      updated_at = NOW()
  `;
}

/**
 * Drop corpus pages whose `source_path` is not in the current walker list.
 * Rows with null `source_path` are left alone.
 */
export async function deletePagesMissingSourcePaths(
  keepSourcePaths: string[],
): Promise<void> {
  if (keepSourcePaths.length === 0) {
    await sql`DELETE FROM kb_pages WHERE source_path IS NOT NULL`;
    return;
  }
  await sql`
    DELETE FROM kb_pages
    WHERE source_path IS NOT NULL
      AND NOT (source_path = ANY(${sql.array(keepSourcePaths)}::text[]))
  `;
}
