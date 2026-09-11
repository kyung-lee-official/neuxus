import type { ChunkifyResult } from "../../../shared/chunkify/index.ts";
import { isoFromDate } from "../../../shared/serialize.ts";
import { findChildrenByPage } from "./dal/children.dal.ts";
import {
  findPageContentHash,
  findPageDetailRow,
  listPageSummaries,
  upsertPageWithChunks,
} from "./dal/pages.dal.ts";
import { findParentsByPage } from "./dal/parents.dal.ts";
import { pageContentHash } from "./hash.ts";

export type KnowledgePageListItem = {
  id: string;
  slug: string;
  title: string;
  type: string | null;
  tags: string[];
  sourcePath: string | null;
  contentHash: string;
  updatedAt: string | null;
  parentCount: number;
  childCount: number;
};

export type KnowledgeChildInspect = {
  id: string;
  childIndex: number;
  text: string;
  startOffset: number | null;
  endOffset: number | null;
  embeddingModel: string | null;
  embeddedAt: string | null;
  embedded: boolean;
};

export type KnowledgeParentInspect = {
  id: string;
  parentIndex: number;
  text: string;
  startOffset: number | null;
  endOffset: number | null;
  children: KnowledgeChildInspect[];
};

export type KnowledgePageDetail = {
  id: string;
  slug: string;
  title: string;
  type: string | null;
  tags: string[];
  body: string;
  sourcePath: string | null;
  contentHash: string;
  updatedAt: string | null;
  parents: KnowledgeParentInspect[];
};

export type SaveKnowledgePageInput = {
  id: string;
  slug: string;
  title: string;
  type: string | null;
  tags: string[];
  body: string;
  sourcePath: string | null;
  chunks: ChunkifyResult;
};

export type SaveKnowledgePageResult = {
  contentHash: string;
  skipped: boolean;
};

export abstract class Page {
  /** All `kb_pages` for admin inspect. No `body`. */
  static async list(): Promise<KnowledgePageListItem[]> {
    const summaries = await listPageSummaries();

    return summaries.map((summary) => ({
      id: summary.id,
      slug: summary.slug,
      title: summary.title ?? "",
      type: summary.type,
      tags: Array.isArray(summary.tags) ? summary.tags.map(String) : [],
      sourcePath: summary.source_path,
      contentHash: summary.content_hash ?? "",
      updatedAt: isoFromDate(summary.updated_at),
      parentCount: summary.parent_count,
      childCount: summary.child_count,
    }));
  }

  /**
   * One page plus parent/child tree for admin inspect. No embedding vectors.
   */
  static async findById(pageId: string): Promise<KnowledgePageDetail | null> {
    const page = await findPageDetailRow(pageId);
    if (!page) return null;

    const parentRows = await findParentsByPage(pageId);
    const childRows = await findChildrenByPage(pageId);

    const childrenByParentId = new Map<string, KnowledgeChildInspect[]>();
    for (const child of childRows) {
      const siblings = childrenByParentId.get(child.parent_id) ?? [];
      siblings.push({
        id: child.id,
        childIndex: child.child_index,
        text: child.text ?? "",
        startOffset: child.start_offset,
        endOffset: child.end_offset,
        embeddingModel: child.embedding_model,
        embeddedAt: isoFromDate(child.embedded_at),
        embedded: child.embedded,
      });
      childrenByParentId.set(child.parent_id, siblings);
    }

    const parents: KnowledgeParentInspect[] = parentRows.map((parent) => {
      const children = (childrenByParentId.get(parent.id) ?? []).slice();
      children.sort((a, b) => a.childIndex - b.childIndex);
      return {
        id: parent.id,
        parentIndex: parent.parent_index,
        text: parent.text ?? "",
        startOffset: parent.start_offset,
        endOffset: parent.end_offset,
        children,
      };
    });

    return {
      id: page.id,
      slug: page.slug,
      title: page.title ?? "",
      type: page.type,
      tags: Array.isArray(page.tags) ? page.tags.map(String) : [],
      body: page.body ?? "",
      sourcePath: page.source_path,
      contentHash: page.content_hash ?? "",
      updatedAt: isoFromDate(page.updated_at),
      parents,
    };
  }

  /**
   * Upsert `kb_pages` and replace that page's parent/child tree, unless
   * `content_hash` already matches (skip gate — no rewrite, no re-chunk needed).
   * Embeddings stay null until a later embed pass.
   * @see docs/modern-knowledge-base-design/02-ingest.md
   * @see docs/modern-knowledge-base-design/appendix-a-data-model.md
   */
  static async save(
    input: SaveKnowledgePageInput,
  ): Promise<SaveKnowledgePageResult> {
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
}
