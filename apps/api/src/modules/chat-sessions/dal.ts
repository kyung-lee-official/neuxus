/**
 * Chat-session DAL. Owns the `app_sessions` table: creation, ownership
 * lookups, title updates, deletion, and `updatedAt` touches.
 *
 * Internal: only `service.ts` imports this file. Other modules use `service.ts`.
 */

import { getPrisma } from "../../shared/db.ts";

export type AppSession = {
  id: string;
  user_id: string;
  title: string | null;
  created_at: Date;
  updated_at: Date;
};

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

/** Most recent session id for `userId`, creating one when none exists. */
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

/** Bump a session's `updatedAt`; silently no-op when the row is gone. */
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
