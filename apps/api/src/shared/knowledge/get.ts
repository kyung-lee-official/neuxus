import { db } from "../db.ts";
import { isoFromDate } from "../serialize.ts";
import { intOrNull, tagsFromRow } from "./row.ts";

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

/**
 * One page plus parent/child tree for admin inspect. No embedding vectors.
 */
export async function findKnowledgePageById(
  pageId: string,
): Promise<KnowledgePageDetail | null> {
  const sql = db();
  const pages = await sql`
    SELECT
      id, slug, title, type, tags, body, source_path, content_hash, updated_at
    FROM kb_pages
    WHERE id = ${pageId}
    LIMIT 1
  `;
  const page = pages[0];
  if (!page) return null;

  const parentRows = await sql`
    SELECT id, parent_index, text, start_offset, end_offset
    FROM kb_parents
    WHERE page_id = ${pageId}
    ORDER BY parent_index
  `;

  const childRows = await sql`
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
    const parentId = String(row.parent_id);
    const list = childrenByParentId.get(parentId) ?? [];
    list.push({
      id: String(row.id),
      childIndex: Number(row.child_index),
      text: String(row.text ?? ""),
      startOffset: intOrNull(row.start_offset),
      endOffset: intOrNull(row.end_offset),
      embeddingModel:
        typeof row.embedding_model === "string" ? row.embedding_model : null,
      embeddedAt: isoFromDate(row.embedded_at as Date | string | null),
      embedded: Boolean(row.embedded),
    });
    childrenByParentId.set(parentId, list);
  }

  const parents: KnowledgeParentInspect[] = parentRows.map((row) => {
    const id = String(row.id);
    const children = childrenByParentId.get(id) ?? [];
    children.sort((a, b) => a.childIndex - b.childIndex);
    return {
      id,
      parentIndex: Number(row.parent_index),
      text: String(row.text ?? ""),
      startOffset: intOrNull(row.start_offset),
      endOffset: intOrNull(row.end_offset),
      children,
    };
  });

  return {
    id: String(page.id),
    slug: String(page.slug),
    title: String(page.title ?? ""),
    type: typeof page.type === "string" ? page.type : null,
    tags: tagsFromRow(page.tags),
    body: String(page.body ?? ""),
    sourcePath: typeof page.source_path === "string" ? page.source_path : null,
    contentHash: String(page.content_hash ?? ""),
    updatedAt: isoFromDate(page.updated_at as Date | string | null),
    parents,
  };
}
