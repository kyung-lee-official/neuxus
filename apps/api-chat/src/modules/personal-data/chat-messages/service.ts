/**
 * Chat-message domain. This is the module's public API — other modules
 * import `ChatMessage` from here, never from `dal.ts`.
 */

import { ChatSession } from "../chat-sessions/service.ts";
import {
  type AppMessage,
  countMessagesBySessionIds,
  findMessagesBySessionIds,
  insertMessage,
  listRecentMessages,
} from "./dal.ts";

export type { AppMessage } from "./dal.ts";

export type MessagePage = {
  items: AppMessage[];
  total: number;
  page: number;
  pageSize: number;
};

const PAGE_SIZE_DEFAULT = 50;
const PAGE_SIZE_MAX = 200;

function clampPage(raw: string | number | undefined): number {
  const n = typeof raw === "number" ? raw : Number.parseInt(raw ?? "1", 10);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
}

function clampPageSize(raw: number | undefined): number {
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 1) {
    return PAGE_SIZE_DEFAULT;
  }
  return Math.min(Math.floor(raw), PAGE_SIZE_MAX);
}

export abstract class ChatMessage {
  /** Append a message to a session and bump the session's `updatedAt`. */
  static async insert(
    sessionId: string,
    role: "user" | "assistant",
    content: string,
  ): Promise<void> {
    await insertMessage(sessionId, role, content);
    await ChatSession.touch(sessionId);
  }

  /** Most recent messages in a session, oldest first. */
  static listRecentBySession(
    sessionId: string,
    limit = 12,
  ): Promise<AppMessage[]> {
    return listRecentMessages(sessionId, limit);
  }

  /** Page a user's messages across all their sessions, newest first. */
  static async pageByUser(
    userId: string,
    rawPage: string | number | undefined,
    rawPageSize: number | undefined,
  ): Promise<MessagePage> {
    const page = clampPage(rawPage);
    const pageSize = clampPageSize(rawPageSize);
    const skip = (page - 1) * pageSize;
    const sessions = await ChatSession.listByUser(userId);
    const sessionIds = sessions.map((session) => session.id);
    const [total, items] = await Promise.all([
      countMessagesBySessionIds(sessionIds),
      findMessagesBySessionIds(sessionIds, skip, pageSize),
    ]);
    return { items, total, page, pageSize };
  }
}
