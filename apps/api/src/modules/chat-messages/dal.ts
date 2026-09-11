/**
 * Chat-message DAL. Owns the `app_messages` table: persistence, recent
 * listing by session, and per-user paging.
 *
 * Internal: only `service.ts` imports this file. Other modules use `service.ts`.
 */

import { getPrisma } from "../../shared/db.ts";
import { ChatSession } from "../chat-sessions/service.ts";

export type AppMessage = {
  id: number;
  session_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: Date;
};

function mapMessage(row: {
  id: bigint;
  sessionId: string;
  role: string;
  content: string;
  createdAt: Date;
}): AppMessage {
  return {
    id: Number(row.id),
    session_id: row.sessionId,
    role: row.role === "assistant" ? "assistant" : "user",
    content: row.content,
    created_at: row.createdAt,
  };
}

/** Append a message to a session and bump the session's `updatedAt`. */
export async function insertMessage(
  sessionId: string,
  role: "user" | "assistant",
  content: string,
): Promise<void> {
  await getPrisma().message.create({
    data: { sessionId, role, content },
  });
  await ChatSession.touch(sessionId);
}

/** Most recent messages in a session, oldest first. */
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

/** Count chat messages across all sessions for one user. */
export async function countMessagesByUser(userId: string): Promise<number> {
  return getPrisma().message.count({
    where: { session: { userId } },
  });
}

/**
 * Page of chat messages for one user (newest first). Pagination is the
 * caller's concern — `skip`/`take` in. Order: `createdAt DESC, id DESC`.
 */
export async function findMessagesByUser(
  userId: string,
  skip: number,
  take: number,
): Promise<AppMessage[]> {
  const rows = await getPrisma().message.findMany({
    where: { session: { userId } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip,
    take,
  });
  return rows.map(mapMessage);
}
