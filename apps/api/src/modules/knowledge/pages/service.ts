import { createHash } from "node:crypto";
import { isoFromDate } from "../../../shared/serialize.ts";
import { Chunkifier, ChunkifierSettings } from "../chunkifier/index.ts";
import { findChildrenByPage } from "./dal/children.dal.ts";
import {
  chunkTreeRows,
  findPageDetailRow,
  findPageHashes,
  listPageBodies,
  listPageSummaries,
  listPagesNeedingChunks,
  replacePageChunks,
  upsertPage,
} from "./dal/pages.dal.ts";
import { findParentsByPage } from "./dal/parents.dal.ts";

export type PageHashFields = {
  title: string;
  tags: string[];
  body: string;
};

export type KnowledgePageListItem = {
  knowledgeBaseId: string;
  id: string;
  title: string;
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
  embeddingModel: string | null;
  embeddedAt: string | null;
  embedded: boolean;
};

export type KnowledgeParentInspect = {
  id: string;
  parentIndex: number;
  text: string;
  children: KnowledgeChildInspect[];
};

export type KnowledgePageDetail = {
  knowledgeBaseId: string;
  id: string;
  title: string;
  tags: string[];
  body: string;
  sourcePath: string | null;
  contentHash: string;
  metaHash: string | null;
  updatedAt: string | null;
  parents: KnowledgeParentInspect[];
};

export type SaveKnowledgePageInput = {
  knowledgeBaseId: string;
  id: string;
  title: string;
  tags: string[];
  body: string;
  sourcePath: string | null;
  /** sha256 of the sibling `*.meta.yaml` bytes, or null when absent. */
  metaHash: string | null;
};

export type SaveKnowledgePageResult = {
  contentHash: string;
  skipped: boolean;
};

export type ChunkifyPagesOptions = {
  /** Rebuild every page's tree, ignoring the freshness gate. */
  force?: boolean;
};

export type ChunkifyPagesResult = {
  pagesProcessed: number;
  /** Pages chunkified to an empty tree (empty body). */
  pagesSkipped: number;
};

export abstract class Page {
  /** Stable page skip-gate hash. @see docs/modern-knowledge-base-design/02-ingest.md */
  static pageContentHash(fields: PageHashFields): string {
    const payload = JSON.stringify({
      title: fields.title,
      tags: [...fields.tags].sort(),
      body: fields.body,
    });
    return createHash("sha256").update(payload).digest("hex");
  }

  /** All `kb_pages` of one knowledge base for admin inspect. No `body`. */
  static async list(knowledgeBaseId: string): Promise<KnowledgePageListItem[]> {
    const summaries = await listPageSummaries(knowledgeBaseId);

    return summaries.map((summary) => ({
      knowledgeBaseId: summary.knowledge_base_id,
      id: summary.id,
      title: summary.title ?? "",
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
  static async findById(
    knowledgeBaseId: string,
    pageId: string,
  ): Promise<KnowledgePageDetail | null> {
    const page = await findPageDetailRow(knowledgeBaseId, pageId);
    if (!page) return null;

    const parentRows = await findParentsByPage(knowledgeBaseId, pageId);
    const childRows = await findChildrenByPage(knowledgeBaseId, pageId);

    const childrenByParentId = new Map<string, KnowledgeChildInspect[]>();
    for (const child of childRows) {
      const siblings = childrenByParentId.get(child.parent_id) ?? [];
      siblings.push({
        id: child.id,
        childIndex: child.child_index,
        text: child.text ?? "",
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
        children,
      };
    });

    return {
      knowledgeBaseId: page.knowledge_base_id,
      id: page.id,
      title: page.title ?? "",
      tags: Array.isArray(page.tags) ? page.tags.map(String) : [],
      body: page.body ?? "",
      sourcePath: page.source_path,
      contentHash: page.content_hash ?? "",
      metaHash: page.meta_hash,
      updatedAt: isoFromDate(page.updated_at),
      parents,
    };
  }

  /**
   * Upsert `kb_pages` unless `content_hash` and `meta_hash` already match
   * (skip gate — no rewrite). Chunk trees are built by `chunkifyPages`, not
   * here; embeddings stay null until the embed pass.
   * @see docs/modern-knowledge-base-design/02-ingest.md
   * @see docs/modern-knowledge-base-design/appendix-a-data-model.md
   */
  static async save(
    input: SaveKnowledgePageInput,
  ): Promise<SaveKnowledgePageResult> {
    const contentHash = Page.pageContentHash({
      title: input.title,
      tags: input.tags,
      body: input.body,
    });

    const stored = await findPageHashes(input.knowledgeBaseId, input.id);
    if (
      stored &&
      stored.content_hash === contentHash &&
      stored.meta_hash === input.metaHash
    ) {
      return { contentHash, skipped: true };
    }

    await upsertPage({
      knowledgeBaseId: input.knowledgeBaseId,
      id: input.id,
      title: input.title,
      tags: input.tags,
      body: input.body,
      sourcePath: input.sourcePath,
      contentHash,
      metaHash: input.metaHash,
    });

    return { contentHash, skipped: false };
  }

  /**
   * Rebuild the parent/child tree for pages whose stored tree is missing or
   * stale (`kb_parents.source_page_hash` ≠ the page's `content_hash`), or for
   * every page when `force`. Knobs come from `ChunkifierSettings`.
   * @see docs/modern-knowledge-base-design/03.1-chunkify.md
   */
  static async chunkifyPages(
    knowledgeBaseId: string,
    options?: ChunkifyPagesOptions,
  ): Promise<ChunkifyPagesResult> {
    const chunkOptions = await ChunkifierSettings.load(knowledgeBaseId);
    const pages = options?.force
      ? await listPageBodies(knowledgeBaseId)
      : await listPagesNeedingChunks(knowledgeBaseId);

    let pagesProcessed = 0;
    let pagesSkipped = 0;

    for (const page of pages) {
      const chunks = Chunkifier.chunkify(page.body, chunkOptions);
      const tree = chunkTreeRows(page.id, page.content_hash, chunks);
      await replacePageChunks(
        knowledgeBaseId,
        page.id,
        tree.parents,
        tree.children,
      );
      pagesProcessed += 1;
      if (chunks.parents.length === 0) pagesSkipped += 1;
    }

    return { pagesProcessed, pagesSkipped };
  }
}
