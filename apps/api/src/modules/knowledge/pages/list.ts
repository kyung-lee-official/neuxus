import { isoFromDate } from "../../../shared/serialize.ts";
import { listPageSummaries } from "./dal.ts";
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
  const rows = await listPageSummaries();

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
