import { db } from "../db.ts";
import { isoFromDate } from "../serialize.ts";
import { tagsFromRow } from "./row.ts";

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

/** All `kb_pages` for admin inspect. No `body`. */
export async function listKnowledgePages(): Promise<KnowledgePageListItem[]> {
  const rows = await db()`
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

  return rows.map((row) => ({
    id: String(row.id),
    slug: String(row.slug),
    title: String(row.title ?? ""),
    type: typeof row.type === "string" ? row.type : null,
    tags: tagsFromRow(row.tags),
    sourcePath: typeof row.source_path === "string" ? row.source_path : null,
    contentHash: String(row.content_hash ?? ""),
    updatedAt: isoFromDate(row.updated_at as Date | string | null),
    parentCount: Number(row.parent_count ?? 0),
    childCount: Number(row.child_count ?? 0),
  }));
}
