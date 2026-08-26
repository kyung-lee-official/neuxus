import { PrismaPg } from "@prisma/adapter-pg";
import postgres from "postgres";
import { PrismaClient } from "../generated/prisma/client.ts";
import { requireDatabaseUrl } from "./config.ts";

export type AppUserRole = "admin" | "member";

export type AppUser = {
  id: string;
  api_key: string;
  role: AppUserRole;
  created_at?: Date;
};

export type AppMessage = {
  id: number;
  session_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: Date;
};

export type AppMemory = {
  id: number;
  user_id: string;
  slug: string;
  content: string;
  created_at: Date;
};

export type AppSession = {
  id: string;
  user_id: string;
  title: string | null;
  created_at: Date;
  updated_at: Date;
};

let prisma: PrismaClient | null = null;

/** Process-wide Prisma client. Lazy-initialized; safe to import without a DB. */
export function getPrisma(): PrismaClient {
  if (!prisma) {
    const adapter = new PrismaPg(requireDatabaseUrl());
    prisma = new PrismaClient({ adapter });
  }
  return prisma;
}

/** Convert Prisma's `bigint` id back to the `number` shape callers expect. */
function bigIntToNumber(value: bigint): number {
  return Number(value);
}

/** Normalize a raw role string from the DB to the `"admin" | "member"` union. */
function normalizeRole(role: string): AppUserRole {
  return role === "admin" ? "admin" : "member";
}

function mapUser(row: {
  id: string;
  apiKey: string;
  role: string;
  createdAt: Date | null;
}): AppUser {
  return {
    id: row.id,
    api_key: row.apiKey,
    role: normalizeRole(row.role),
    created_at: row.createdAt ?? undefined,
  };
}

function mapSession(row: {
  id: string;
  userId: string;
  title: string | null;
  createdAt: Date;
  updatedAt: Date;
}): AppSession {
  return {
    id: row.id,
    user_id: row.userId,
    title: row.title,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}

function mapMessage(row: {
  id: bigint;
  sessionId: string;
  role: string;
  content: string;
  createdAt: Date;
}): AppMessage {
  return {
    id: bigIntToNumber(row.id),
    session_id: row.sessionId,
    role: row.role === "assistant" ? "assistant" : "user",
    content: row.content,
    created_at: row.createdAt,
  };
}

function mapMemory(row: {
  id: bigint;
  userId: string;
  slug: string;
  content: string;
  createdAt: Date;
}): AppMemory {
  return {
    id: bigIntToNumber(row.id),
    user_id: row.userId,
    slug: row.slug,
    content: row.content,
    created_at: row.createdAt,
  };
}

let sql: ReturnType<typeof postgres> | null = null;

/**
 * Raw `postgres` connection accessor. Kept for non-vector modules that
 * still use raw SQL (settings / corpus / knowledge CRUD). Vector and
 * tsvector paths also rely on this until they migrate. New code should
 * prefer the Prisma client via `import { prisma } from "shared/db.ts"`.
 */
export function db(): ReturnType<typeof postgres> {
  if (!sql) {
    sql = postgres(requireDatabaseUrl(), { max: 10 });
  }
  return sql;
}

export async function closeDb(): Promise<void> {
  if (sql) {
    await sql.end({ timeout: 5 });
    sql = null;
  }
  if (prisma) {
    await prisma.$disconnect();
    prisma = null;
  }
}

export type NukeTarget = "app";

/**
 * Hard-wipe `public` (tables, types, extensions). No remigrate. Runs
 * DDL outside Prisma — Prisma does not model extension drops or
 * schema-level operations.
 */
async function wipePublicSchema(connectionString: string): Promise<void> {
  const s = postgres(connectionString, { max: 1 });
  try {
    // Drop non-core extensions first (e.g. vector), then the whole public schema.
    await s.unsafe(`
      DO $wipe$
      DECLARE
        ext record;
      BEGIN
        FOR ext IN
          SELECT extname FROM pg_extension WHERE extname <> 'plpgsql'
        LOOP
          EXECUTE format('DROP EXTENSION IF EXISTS %I CASCADE', ext.extname);
        END LOOP;
      END
      $wipe$;
    `);
    await s.unsafe("DROP SCHEMA IF EXISTS public CASCADE");
    await s.unsafe("CREATE SCHEMA public");
    await s.unsafe("GRANT ALL ON SCHEMA public TO CURRENT_USER");
    await s.unsafe("GRANT ALL ON SCHEMA public TO public");
  } finally {
    await s.end({ timeout: 5 });
  }
}

/** Wipe the neuxus database `public` schema. Recreate via Prisma migrate. */
export async function nukeDatabases(target: NukeTarget): Promise<void> {
  if (target !== "app") {
    throw new Error("Only target 'app' is supported");
  }
  await closeDb();
  await wipePublicSchema(requireDatabaseUrl());
}

export async function upsertUser(user: AppUser): Promise<AppUser> {
  const row = await getPrisma().user.upsert({
    where: { id: user.id },
    create: {
      id: user.id,
      apiKey: user.api_key,
      role: user.role,
    },
    update: {
      apiKey: user.api_key,
      role: user.role,
    },
  });
  return mapUser(row);
}

export async function listUsers(): Promise<AppUser[]> {
  const rows = await getPrisma().user.findMany({ orderBy: { id: "asc" } });
  return rows.map(mapUser);
}

export async function getUserById(id: string): Promise<AppUser | null> {
  const row = await getPrisma().user.findUnique({ where: { id } });
  return row ? mapUser(row) : null;
}

export async function createUser(
  id: string,
  apiKey: string,
  role: AppUserRole = "member",
): Promise<AppUser> {
  const row = await getPrisma().user.create({
    data: { id, apiKey, role },
  });
  return mapUser(row);
}

export async function updateUserApiKey(
  id: string,
  apiKey: string,
): Promise<AppUser | null> {
  try {
    const row = await getPrisma().user.update({
      where: { id },
      data: { apiKey },
    });
    return mapUser(row);
  } catch (err) {
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code?: string }).code === "P2025"
    ) {
      return null;
    }
    throw err;
  }
}

export async function deleteUser(id: string): Promise<boolean> {
  try {
    await getPrisma().user.delete({ where: { id } });
    return true;
  } catch (err) {
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code?: string }).code === "P2025"
    ) {
      return false;
    }
    throw err;
  }
}

export async function countUsers(): Promise<number> {
  return getPrisma().user.count();
}

export async function getUserByApiKey(apiKey: string): Promise<AppUser | null> {
  const row = await getPrisma().user.findUnique({ where: { apiKey } });
  return row ? mapUser(row) : null;
}

export async function getOrCreateSession(userId: string): Promise<string> {
  const existing = await getPrisma().session.findFirst({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    select: { id: true },
  });
  if (existing) return existing.id;
  const created = await createSession(userId);
  return created.id;
}

/** Create a new empty chat session for a user. */
export async function createSession(userId: string): Promise<AppSession> {
  const newId = crypto.randomUUID();
  const row = await getPrisma().session.create({
    data: { id: newId, userId },
  });
  return mapSession(row);
}

/** Session owned by `userId`, or null. */
export async function getSessionOwnedByUser(
  sessionId: string,
  userId: string,
): Promise<AppSession | null> {
  const row = await getPrisma().session.findFirst({
    where: { id: sessionId, userId },
  });
  return row ? mapSession(row) : null;
}

/** Update title for a session owned by `userId`. Empty title clears to null. */
export async function updateSessionTitle(
  sessionId: string,
  userId: string,
  title: string | null,
): Promise<AppSession | null> {
  const owned = await getPrisma().session.findFirst({
    where: { id: sessionId, userId },
    select: { id: true },
  });
  if (!owned) return null;
  try {
    const row = await getPrisma().session.update({
      where: { id: sessionId },
      data: { title, updatedAt: new Date() },
    });
    return mapSession(row);
  } catch (err) {
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code?: string }).code === "P2025"
    ) {
      return null;
    }
    throw err;
  }
}

/**
 * Delete a session owned by `userId`. Returns true on success, false
 * when the session does not exist or is owned by another user.
 * Messages cascade-delete via FK (`onDelete: Cascade` on `Message`).
 */
export async function deleteSessionForUser(
  sessionId: string,
  userId: string,
): Promise<boolean> {
  const result = await getPrisma().session.deleteMany({
    where: { id: sessionId, userId },
  });
  return result.count > 0;
}

export async function touchSession(sessionId: string): Promise<void> {
  try {
    await getPrisma().session.update({
      where: { id: sessionId },
      data: { updatedAt: new Date() },
    });
  } catch (err) {
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code?: string }).code === "P2025"
    ) {
      return;
    }
    throw err;
  }
}

export async function listRecentMessages(
  sessionId: string,
  limit = 12,
): Promise<AppMessage[]> {
  const rows = await getPrisma().message.findMany({
    where: { sessionId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.map(mapMessage).reverse();
}

export async function insertMessage(
  sessionId: string,
  role: "user" | "assistant",
  content: string,
): Promise<void> {
  await getPrisma().message.create({
    data: { sessionId, role, content },
  });
  await touchSession(sessionId);
}

export async function insertMemory(
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

/** All personal memories for one user (hard `user_id` filter). */
export async function listMemoriesForUser(
  userId: string,
): Promise<AppMemory[]> {
  const rows = await getPrisma().memory.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(mapMemory);
}

/** Delete one memory owned by `userId`. Returns false if missing. */
export async function deleteMemoryForUser(
  userId: string,
  memoryId: number,
): Promise<boolean> {
  const result = await getPrisma().memory.deleteMany({
    where: { id: BigInt(memoryId), userId },
  });
  return result.count > 0;
}

/** All chat sessions for one user. */
export async function listSessionsForUser(
  userId: string,
): Promise<AppSession[]> {
  const rows = await getPrisma().session.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
  });
  return rows.map(mapSession);
}

/** Count chat messages across all sessions for one user. */
export async function countMessagesForUser(userId: string): Promise<number> {
  return getPrisma().message.count({
    where: { session: { userId } },
  });
}

/**
 * Page of chat messages for one user (newest first). Pagination is
 * the caller's concern — `skip`/`take` in. Order: `createdAt DESC, id DESC`.
 */
export async function findMessagesForUser(
  userId: string,
  options: { skip: number; take: number },
): Promise<AppMessage[]> {
  const rows = await getPrisma().message.findMany({
    where: { session: { userId } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: options.take,
    skip: options.skip,
  });
  return rows.map(mapMessage);
}

/**
 * Postgres full-text search over a user's memories via
 * `to_tsvector`/`plainto_tsquery`. Returns up to `limit` matches,
 * newest first. Stays raw — Prisma does not model this index.
 *
 * Search policy (trim input, try FTS first, fall back to recent)
 * lives in the calling service.
 */
export async function searchMemoriesByUserFTS(
  userId: string,
  query: string,
  limit: number,
): Promise<AppMemory[]> {
  const matched = await db()`
    SELECT id, user_id, slug, content, created_at
    FROM app_memories
    WHERE user_id = ${userId}
      AND to_tsvector('english', content) @@ plainto_tsquery('english', ${query})
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
  return matched.map((row) => ({
    id: Number(row.id),
    user_id: row.user_id as string,
    slug: row.slug as string,
    content: row.content as string,
    created_at: row.created_at as Date,
  }));
}
