import type { ChunkifyResult } from "../../../shared/chunkify/index.ts";
import { findPageContentHash, upsertPageWithChunks } from "../dal/pages.dal.ts";
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

/**
 * Upsert `kb_pages` and replace that page's parent/child tree, unless
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

  await upsertPageWithChunks({
    id: input.id,
    slug: input.slug,
    title: input.title,
    type: input.type,
    tags: input.tags,
    body: input.body,
    sourcePath: input.sourcePath,
    contentHash,
    chunks: input.chunks,
  });

  return { contentHash, skipped: false };
}
