import type { ChunkifyResult } from "../chunkify/index.ts";
import { db } from "../db.ts";
import { pageContentHash } from "./hash.ts";

export type PersistKnowledgePageInput = {
  id: string;
  slug: string;
  title: string;
  type: string | null;
  tags: string[];
  body: string;
  sourcePath: string | null;
  chunks: ChunkifyResult;
};

export type PersistKnowledgePageResult = {
  contentHash: string;
  skipped: boolean;
};

/** Stored `kb_pages.content_hash`, or null if the page is missing. */
export async function findPageContentHash(
  pageId: string,
): Promise<string | null> {
  const rows = await db()`
    SELECT content_hash FROM kb_pages WHERE id = ${pageId} LIMIT 1
  `;
  const hash = rows[0]?.content_hash;
  return typeof hash === "string" ? hash : null;
}

/**
 * Upsert `kb_pages` and replace that page’s parent/child tree, unless
 * `content_hash` already matches (skip gate — no rewrite, no re-chunk needed).
 * Embeddings stay null until a later embed pass.
 * @see docs/modern-knowledge-base-design/02-ingest.md
 * @see docs/modern-knowledge-base-design/appendix-a-data-model.md
 */
export async function persistKnowledgePage(
  input: PersistKnowledgePageInput,
): Promise<PersistKnowledgePageResult> {
  const contentHash = pageContentHash({
    title: input.title,
    type: input.type,
    tags: input.tags,
    body: input.body,
  });

  const stored = await findPageContentHash(input.id);
  if (stored === contentHash) {
    return { contentHash, skipped: true };
  }

  const sql = db();
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
        ${contentHash},
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

  return { contentHash, skipped: false };
}

/**
 * Drop corpus pages whose `source_path` is not in the current walker list.
 * Rows with null `source_path` are left alone.
 */
export async function deleteKnowledgePagesMissingSourcePaths(
  keepSourcePaths: string[],
): Promise<void> {
  const sql = db();
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
