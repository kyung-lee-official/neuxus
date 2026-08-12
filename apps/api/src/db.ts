import postgres from "postgres";
import {
  apiKeyForSeedUser,
  requireDatabaseUrl,
  SEED_USER_IDS,
} from "./config.ts";

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

function mapSessionRow(row: Record<string, unknown>): AppSession {
  return {
    id: row.id as string,
    user_id: row.user_id as string,
    title: (row.title as string | null) ?? null,
    created_at: row.created_at as Date,
    updated_at: row.updated_at as Date,
  };
}

let sql: ReturnType<typeof postgres> | null = null;

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
}

export type NukeTarget = "app";

/** Hard-wipe `public` (tables, types, extensions). No remigrate. */
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

function mapUserRow(row: Record<string, unknown>): AppUser {
  const role = row.role === "admin" ? "admin" : "member";
  return {
    id: row.id as string,
    api_key: row.api_key as string,
    role,
    created_at: row.created_at as Date | undefined,
  };
}

export async function upsertUser(user: AppUser): Promise<AppUser> {
  const rows = await db()`
    INSERT INTO app_users (id, api_key, role)
    VALUES (${user.id}, ${user.api_key}, ${user.role})
    ON CONFLICT (id) DO UPDATE SET
      api_key = EXCLUDED.api_key,
      role = EXCLUDED.role
    RETURNING id, api_key, role, created_at
  `;
  const row = rows[0];
  if (!row) throw new Error("upsertUser returned no row");
  return mapUserRow(row as Record<string, unknown>);
}

export async function listUsers(): Promise<AppUser[]> {
  const rows = await db()`
    SELECT id, api_key, role, created_at FROM app_users ORDER BY id ASC
  `;
  return rows.map((row) => mapUserRow(row as Record<string, unknown>));
}

export async function getUserById(id: string): Promise<AppUser | null> {
  const rows = await db()`
    SELECT id, api_key, role, created_at FROM app_users WHERE id = ${id} LIMIT 1
  `;
  if (rows.length === 0) return null;
  return mapUserRow(rows[0]! as Record<string, unknown>);
}

export async function createUser(
  id: string,
  apiKey: string,
  role: AppUserRole = "member",
): Promise<AppUser> {
  const rows = await db()`
    INSERT INTO app_users (id, api_key, role)
    VALUES (${id}, ${apiKey}, ${role})
    RETURNING id, api_key, role, created_at
  `;
  const row = rows[0];
  if (!row) throw new Error("createUser returned no row");
  return mapUserRow(row as Record<string, unknown>);
}

export async function updateUserApiKey(
  id: string,
  apiKey: string,
): Promise<AppUser | null> {
  const rows = await db()`
    UPDATE app_users SET api_key = ${apiKey}
    WHERE id = ${id}
    RETURNING id, api_key, role, created_at
  `;
  if (rows.length === 0) return null;
  return mapUserRow(rows[0]! as Record<string, unknown>);
}

export async function deleteUser(id: string): Promise<boolean> {
  const rows = await db()`
    DELETE FROM app_users WHERE id = ${id} RETURNING id
  `;
  return rows.length > 0;
}

export async function countUsers(): Promise<number> {
  const rows = await db()`SELECT COUNT(*)::int AS n FROM app_users`;
  return (rows[0]?.n as number) ?? 0;
}

export async function getUserByApiKey(apiKey: string): Promise<AppUser | null> {
  const rows = await db()`
    SELECT id, api_key, role, created_at FROM app_users WHERE api_key = ${apiKey} LIMIT 1
  `;
  if (rows.length === 0) return null;
  return mapUserRow(rows[0]! as Record<string, unknown>);
}

export async function getOrCreateSession(userId: string): Promise<string> {
  const s = db();
  const existing = await s`
    SELECT id FROM app_sessions WHERE user_id = ${userId} ORDER BY updated_at DESC LIMIT 1
  `;
  if (existing.length > 0) return existing[0]!.id as string;

  const created = await createSession(userId);
  return created.id;
}

/** Create a new empty chat session for a user. */
export async function createSession(userId: string): Promise<AppSession> {
  const newId = crypto.randomUUID();
  const rows = await db()`
    INSERT INTO app_sessions (id, user_id)
    VALUES (${newId}::uuid, ${userId})
    RETURNING id, user_id, title, created_at, updated_at
  `;
  const row = rows[0];
  if (!row) throw new Error("createSession returned no row");
  return mapSessionRow(row as Record<string, unknown>);
}

/** Session owned by `userId`, or null. */
export async function getSessionOwnedByUser(
  sessionId: string,
  userId: string,
): Promise<AppSession | null> {
  const rows = await db()`
    SELECT id, user_id, title, created_at, updated_at
    FROM app_sessions
    WHERE id = ${sessionId}::uuid AND user_id = ${userId}
    LIMIT 1
  `;
  if (rows.length === 0) return null;
  return mapSessionRow(rows[0]! as Record<string, unknown>);
}

/** Update title for a session owned by `userId`. Empty title clears to null. */
export async function updateSessionTitle(
  sessionId: string,
  userId: string,
  title: string | null,
): Promise<AppSession | null> {
  const rows = await db()`
    UPDATE app_sessions
    SET title = ${title}, updated_at = NOW()
    WHERE id = ${sessionId}::uuid AND user_id = ${userId}
    RETURNING id, user_id, title, created_at, updated_at
  `;
  if (rows.length === 0) return null;
  return mapSessionRow(rows[0]! as Record<string, unknown>);
}

export async function touchSession(sessionId: string): Promise<void> {
  await db()`UPDATE app_sessions SET updated_at = NOW() WHERE id = ${sessionId}::uuid`;
}

export async function listRecentMessages(
  sessionId: string,
  limit = 12,
): Promise<AppMessage[]> {
  const rows = await db()`
    SELECT id, session_id, role, content, created_at
    FROM app_messages
    WHERE session_id = ${sessionId}::uuid
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
  return rows
    .map((row) => ({
      id: Number(row.id),
      session_id: row.session_id as string,
      role: row.role as "user" | "assistant",
      content: row.content as string,
      created_at: row.created_at as Date,
    }))
    .reverse();
}

export async function insertMessage(
  sessionId: string,
  role: "user" | "assistant",
  content: string,
): Promise<void> {
  await db()`
    INSERT INTO app_messages (session_id, role, content)
    VALUES (${sessionId}::uuid, ${role}, ${content})
  `;
  await touchSession(sessionId);
}

export async function insertMemory(
  userId: string,
  slug: string,
  content: string,
): Promise<AppMemory> {
  const rows = await db()`
    INSERT INTO app_memories (user_id, slug, content)
    VALUES (${userId}, ${slug}, ${content})
    ON CONFLICT (user_id, slug) DO UPDATE SET content = EXCLUDED.content
    RETURNING id, user_id, slug, content, created_at
  `;
  const row = rows[0];
  if (!row) throw new Error("insertMemory returned no row");
  return {
    id: Number(row.id),
    user_id: row.user_id as string,
    slug: row.slug as string,
    content: row.content as string,
    created_at: row.created_at as Date,
  };
}

/** All personal memories for one user (hard `user_id` filter). */
export async function listMemoriesForUser(
  userId: string,
): Promise<AppMemory[]> {
  const rows = await db()`
    SELECT id, user_id, slug, content, created_at
    FROM app_memories
    WHERE user_id = ${userId}
    ORDER BY created_at DESC
  `;
  return rows.map((row) => ({
    id: Number(row.id),
    user_id: row.user_id as string,
    slug: row.slug as string,
    content: row.content as string,
    created_at: row.created_at as Date,
  }));
}

/** Delete one memory owned by `userId`. Returns false if missing. */
export async function deleteMemoryForUser(
  userId: string,
  memoryId: number,
): Promise<boolean> {
  const rows = await db()`
    DELETE FROM app_memories
    WHERE id = ${memoryId} AND user_id = ${userId}
    RETURNING id
  `;
  return rows.length > 0;
}

/** All chat sessions for one user. */
export async function listSessionsForUser(
  userId: string,
): Promise<AppSession[]> {
  const rows = await db()`
    SELECT id, user_id, title, created_at, updated_at
    FROM app_sessions
    WHERE user_id = ${userId}
    ORDER BY updated_at DESC
  `;
  return rows.map((row) => mapSessionRow(row as Record<string, unknown>));
}

export type MessagePage = {
  items: AppMessage[];
  total: number;
  page: number;
  pageSize: number;
};

/** Chat messages for one user (newest first), paginated. */
export async function listMessagesForUser(
  userId: string,
  options?: { page?: number; pageSize?: number },
): Promise<MessagePage> {
  const pageSize = Math.min(Math.max(options?.pageSize ?? 50, 1), 200);
  const page = Math.max(options?.page ?? 1, 1);
  const offset = (page - 1) * pageSize;

  const countRows = await db()`
    SELECT COUNT(*)::int AS count
    FROM app_messages m
    INNER JOIN app_sessions s ON s.id = m.session_id
    WHERE s.user_id = ${userId}
  `;
  const total = Number(countRows[0]?.count ?? 0);

  const rows = await db()`
    SELECT m.id, m.session_id, m.role, m.content, m.created_at
    FROM app_messages m
    INNER JOIN app_sessions s ON s.id = m.session_id
    WHERE s.user_id = ${userId}
    ORDER BY m.created_at DESC, m.id DESC
    LIMIT ${pageSize}
    OFFSET ${offset}
  `;

  return {
    items: rows.map((row) => ({
      id: Number(row.id),
      session_id: row.session_id as string,
      role: row.role as "user" | "assistant",
      content: row.content as string,
      created_at: row.created_at as Date,
    })),
    total,
    page,
    pageSize,
  };
}

/** Retrieve memories for one user only (hard `user_id` filter). */
export async function searchMemoriesByUser(
  userId: string,
  query: string,
  limit = 8,
): Promise<AppMemory[]> {
  const q = query.trim();
  if (q) {
    const matched = await db()`
      SELECT id, user_id, slug, content, created_at
      FROM app_memories
      WHERE user_id = ${userId}
        AND to_tsvector('english', content) @@ plainto_tsquery('english', ${q})
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;
    if (matched.length > 0) {
      return matched.map((row) => ({
        id: Number(row.id),
        user_id: row.user_id as string,
        slug: row.slug as string,
        content: row.content as string,
        created_at: row.created_at as Date,
      }));
    }
  }

  const recent = await db()`
    SELECT id, user_id, slug, content, created_at
    FROM app_memories
    WHERE user_id = ${userId}
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
  return recent.map((row) => ({
    id: Number(row.id),
    user_id: row.user_id as string,
    slug: row.slug as string,
    content: row.content as string,
    created_at: row.created_at as Date,
  }));
}

/** Upsert demo users into `app_users`; `haewon` is admin, others member. Drop legacy `bob`. */
export async function seedAppUsers(): Promise<AppUser[]> {
  const seeded: AppUser[] = [];
  for (const id of SEED_USER_IDS) {
    const role = id === "haewon" ? "admin" : "member";
    seeded.push(await upsertUser({ id, api_key: apiKeyForSeedUser(id), role }));
  }
  await deleteUser("bob");
  return seeded;
}
