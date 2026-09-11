import { isoFromDate } from "../../../shared/serialize.ts";
import { findChildRows, findPageDetailRow, findParentRows } from "./dal.ts";
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

/**
 * One page plus parent/child tree for admin inspect. No embedding vectors.
 */
export async function findKnowledgePageById(
  pageId: string,
): Promise<KnowledgePageDetail | null> {
  const page = await findPageDetailRow(pageId);
  if (!page) return null;

  const parentRows = await findParentRows(pageId);
  const childRows = await findChildRows(pageId);

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
