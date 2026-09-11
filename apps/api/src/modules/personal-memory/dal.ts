/**
 * Personal-memory DAL. Owns the `app_memories` table: persistence, listing,
 * deletion, and full-text search. Domain policy (search fallback, slug
 * generation) lives in `service.ts`.
 *
 * Internal: only `service.ts` imports this file. Other modules use `service.ts`.
 */

import { sql } from "bun";
import { getPrisma } from "../../shared/db.ts";

export type AppMemory = {
  id: number;
  user_id: string;
  slug: string;
  content: string;
  created_at: Date;
};

function mapMemory(row: {
  id: bigint;
  userId: string;
  slug: string;
  content: string;
  createdAt: Date;
}): AppMemory {
  return {
    id: Number(row.id),
    user_id: row.userId,
    slug: row.slug,
    content: row.content,
    created_at: row.createdAt,
  };
}

/** Upsert a memory by `(userId, slug)`. */
export async function upsertMemory(
  userId: string,
  slug: string,
  content: string,
): Promise<AppMemory> {
  const row = await getPrisma().memory.upsert({
    where: { userId_slug: { userId, slug } },
    create: { userId, slug, content },
    update: { content },
  });
  return mapMemory(row);
}

/** All personal memories for one user (hard `user_id` filter), newest first. */
export async function listMemoriesByUser(
  userId: string,
  limit?: number,
): Promise<AppMemory[]> {
  const rows = await getPrisma().memory.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    ...(limit ? { take: limit } : {}),
  });
  return rows.map(mapMemory);
}

/** Delete one memory owned by `userId`. Returns false if missing. */
export async function deleteMemoryByUser(
  userId: string,
  memoryId: number,
): Promise<boolean> {
  const result = await getPrisma().memory.deleteMany({
    where: { id: BigInt(memoryId), userId },
  });
  return result.count > 0;
}

type MemoryRow = {
  /** Postgres `bigint` is returned as string by default in Bun's `sql`. */
  id: string;
  user_id: string;
  slug: string;
  content: string;
  created_at: Date;
};

/**
 * Postgres full-text search over a user's memories via
 * `to_tsvector`/`plainto_tsquery`. Returns up to `limit` matches, newest
 * first. Stays raw — Prisma does not model this index.
 */
export async function searchMemoriesByUserFTS(
  userId: string,
  query: string,
  limit: number,
): Promise<AppMemory[]> {
  const matched = await sql<MemoryRow[]>`
    SELECT id, user_id, slug, content, created_at
    FROM app_memories
    WHERE user_id = ${userId}
      AND to_tsvector('english', content) @@ plainto_tsquery('english', ${query})
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
  return matched.map((row) => ({
    id: Number(row.id),
    user_id: row.user_id,
    slug: row.slug,
    content: row.content,
    created_at: row.created_at,
  }));
}
