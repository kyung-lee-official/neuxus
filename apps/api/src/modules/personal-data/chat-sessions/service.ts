import { status } from "elysia";
import { sessionJson } from "../../../shared/serialize.ts";
import type { AppUser } from "../../users/service.ts";
import {
  type AppSession,
  createSession,
  deleteSessionForUser,
  getOrCreateSession,
  getSessionOwnedByUser,
  listSessionsForUser,
  touchSession,
  updateSessionTitle,
} from "./dal.ts";
import type { SessionsModel } from "./model.ts";

export type { AppSession } from "./dal.ts";

export abstract class ChatSession {
  static async list(user: AppUser) {
    const sessions = await listSessionsForUser(user.id);
    return { sessions: sessions.map(sessionJson) };
  }

  static async create(user: AppUser) {
    const session = await createSession(user.id);
    return status(201, sessionJson(session));
  }

  static async patch(
    user: AppUser,
    sessionIdParam: string,
    body: SessionsModel["patchBody"],
  ) {
    const sessionId = sessionIdParam.trim();
    if (!sessionId) throw status(400, { error: "Invalid session id" });

    let title: string | null;
    if (body.title === null) {
      title = null;
    } else {
      const trimmed = body.title.trim();
      title = trimmed.length > 0 ? trimmed : null;
    }

    const session = await updateSessionTitle(sessionId, user.id, title);
    if (!session) throw status(404, { error: "Session not found" });
    return sessionJson(session);
  }

  static async delete(user: AppUser, sessionIdParam: string) {
    const sessionId = sessionIdParam.trim();
    if (!sessionId) throw status(400, { error: "Invalid session id" });
    const ok = await deleteSessionForUser(sessionId, user.id);
    if (!ok) throw status(404, { error: "Session not found" });
    return { deleted: true as const, id: sessionId };
  }

  /** Most recent session id for `userId`, creating one when none exists. */
  static getOrCreate(userId: string): Promise<string> {
    return getOrCreateSession(userId);
  }

  /** Session owned by `userId`, or null. */
  static getOwnedByUser(
    sessionId: string,
    userId: string,
  ): Promise<AppSession | null> {
    return getSessionOwnedByUser(sessionId, userId);
  }

  /** All sessions for one user, newest first. */
  static listByUser(userId: string): Promise<AppSession[]> {
    return listSessionsForUser(userId);
  }

  /** Bump a session's `updatedAt` (called when a message is appended). */
  static touch(sessionId: string): Promise<void> {
    return touchSession(sessionId);
  }
}
