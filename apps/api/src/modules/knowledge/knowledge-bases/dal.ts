/**
 * Knowledge-base DAL. Owns `kb_knowledge_bases`: the isolated knowledge sets
 * every page, chunk, and search is scoped to.
 *
 * Internal to the knowledge-bases sub-module: only `service.ts` imports it.
 */

import { getPrisma } from "../../../shared/db.ts";

/** Raw `kb_knowledge_bases` row. */
export type KnowledgeBaseRecord = {
  id: string;
  name: string;
  /** false = read-only (corpus-backed); true = writable (updated directly). */
  writable: boolean;
  createdAt: Date;
};

/** All knowledge bases, oldest first. */
export async function listKnowledgeBases(): Promise<KnowledgeBaseRecord[]> {
  const rows = await getPrisma().knowledgeBase.findMany({
    orderBy: { createdAt: "asc" },
  });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    writable: row.writable,
    createdAt: row.createdAt,
  }));
}

/** One knowledge base by `id`, or null when it does not exist. */
export async function findKnowledgeBase(
  id: string,
): Promise<KnowledgeBaseRecord | null> {
  const row = await getPrisma().knowledgeBase.findUnique({ where: { id } });
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    writable: row.writable,
    createdAt: row.createdAt,
  };
}

/** Insert a knowledge base. Throws when the `id` already exists. */
export async function createKnowledgeBase(input: {
  id: string;
  name: string;
  writable: boolean;
}): Promise<void> {
  await getPrisma().knowledgeBase.create({ data: input });
}

/** Update `name` and/or `writable`. Missing fields are left unchanged. */
export async function updateKnowledgeBase(
  id: string,
  fields: { name?: string; writable?: boolean },
): Promise<void> {
  await getPrisma().knowledgeBase.update({ where: { id }, data: fields });
}

/** Delete a knowledge base; cascades to its pages, chunks, and settings. */
export async function deleteKnowledgeBase(id: string): Promise<void> {
  await getPrisma().knowledgeBase.delete({ where: { id } });
}
