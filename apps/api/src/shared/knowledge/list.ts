import { sql } from "bun";
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

type PageRow = {
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

/** All `kb_pages` for admin inspect. No `body`. */
export async function listKnowledgePages(): Promise<KnowledgePageListItem[]> {
  const rows = await sql<PageRow[]>`
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
    id: row.id,
    slug: row.slug,
    title: row.title ?? "",
    type: row.type,
    tags: tagsFromRow(row.tags),
    sourcePath: row.source_path,
    contentHash: row.content_hash ?? "",
    updatedAt: isoFromDate(row.updated_at),
    parentCount: row.parent_count,
    childCount: row.child_count,
  }));
}
