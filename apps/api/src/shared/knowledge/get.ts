import { sql } from "bun";
import { isoFromDate } from "../serialize.ts";
import { tagsFromRow } from "./row.ts";

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

type PageRow = {
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

type ParentRow = {
  id: string;
  parent_index: number;
  text: string | null;
  start_offset: number | null;
  end_offset: number | null;
};

type ChildRow = {
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

/**
 * One page plus parent/child tree for admin inspect. No embedding vectors.
 */
export async function findKnowledgePageById(
  pageId: string,
): Promise<KnowledgePageDetail | null> {
  const pages = await sql<PageRow[]>`
    SELECT
      id, slug, title, type, tags, body, source_path, content_hash, updated_at
    FROM kb_pages
    WHERE id = ${pageId}
    LIMIT 1
  `;
  const page = pages[0];
  if (!page) return null;

  const parentRows = await sql<ParentRow[]>`
    SELECT id, parent_index, text, start_offset, end_offset
    FROM kb_parents
    WHERE page_id = ${pageId}
    ORDER BY parent_index
  `;

  const childRows = await sql<ChildRow[]>`
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

  const childrenByParentId = new Map<string, KnowledgeChildInspect[]>();
  for (const row of childRows) {
    const list = childrenByParentId.get(row.parent_id) ?? [];
    list.push({
      id: row.id,
      childIndex: row.child_index,
      text: row.text ?? "",
      startOffset: row.start_offset,
      endOffset: row.end_offset,
      embeddingModel: row.embedding_model,
      embeddedAt: isoFromDate(row.embedded_at),
      embedded: row.embedded,
    });
    childrenByParentId.set(row.parent_id, list);
  }

  const parents: KnowledgeParentInspect[] = parentRows.map((row) => {
    const children = (childrenByParentId.get(row.id) ?? []).slice();
    children.sort((a, b) => a.childIndex - b.childIndex);
    return {
      id: row.id,
      parentIndex: row.parent_index,
      text: row.text ?? "",
      startOffset: row.start_offset,
      endOffset: row.end_offset,
      children,
    };
  });

  return {
    id: page.id,
    slug: page.slug,
    title: page.title ?? "",
    type: page.type,
    tags: tagsFromRow(page.tags),
    body: page.body ?? "",
    sourcePath: page.source_path,
    contentHash: page.content_hash ?? "",
    updatedAt: isoFromDate(page.updated_at),
    parents,
  };
}
