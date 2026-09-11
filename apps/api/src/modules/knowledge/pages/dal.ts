/**
 * Knowledge-pages DAL. Owns `kb_pages` and its `kb_parents` / `kb_children`
 * chunk tree.
 *
 * Internal to the pages sub-module: the domain files (`list.ts`, `get.ts`,
 * `persist.ts`) import it.
 */

import { sql } from "bun";
import type { ChunkifyResult } from "../../../shared/chunkify/index.ts";

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

export type ParentRow = {
  id: string;
  parent_index: number;
  text: string | null;
  start_offset: number | null;
  end_offset: number | null;
};

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

/** All `kb_pages` with parent/child counts, ordered by slug. No `body`. */
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

/** Parent rows for one page, ordered by `parent_index`. */
export async function findParentRows(pageId: string): Promise<ParentRow[]> {
  return sql<ParentRow[]>`
    SELECT id, parent_index, text, start_offset, end_offset
    FROM kb_parents
    WHERE page_id = ${pageId}
    ORDER BY parent_index
  `;
}

/** Child rows for one page, ordered by `child_index`. */
export async function findChildRows(pageId: string): Promise<ChildRow[]> {
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

/** Upsert one `kb_pages` row and replace its parent/child tree atomically. */
export async function upsertPageWithChunks(
  input: UpsertPageWithChunksInput,
): Promise<void> {
  await sql.begin(async (tx) => {
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

    await tx`DELETE FROM kb_parents WHERE page_id = ${input.id}`;

    for (const parent of input.chunks.parents) {
      const parentId = `${input.id}:p:${parent.index}`;
      await tx`
        INSERT INTO kb_parents (
          id, page_id, parent_index, text, start_offset, end_offset
        )
        VALUES (
          ${parentId},
          ${input.id},
          ${parent.index},
          ${parent.text},
          ${parent.start},
          ${parent.end}
        )
      `;
    }

    for (const child of input.chunks.children) {
      const parentId = `${input.id}:p:${child.parentIndex}`;
      const childId = `${parentId}:c:${child.index}`;
      await tx`
        INSERT INTO kb_children (
          id, parent_id, page_id, child_index, text, start_offset, end_offset
        )
        VALUES (
          ${childId},
          ${parentId},
          ${input.id},
          ${child.index},
          ${child.text},
          ${child.start},
          ${child.end}
        )
      `;
    }
  });
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
