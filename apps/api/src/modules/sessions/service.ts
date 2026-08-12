import { status } from "elysia";
import type { AppUser } from "../../db.ts";
import {
  createSession,
  listSessionsForUser,
  updateSessionTitle,
} from "../../db.ts";
import { sessionJson } from "../../shared/serialize.ts";
import type { SessionsModel } from "./model.ts";

export abstract class Sessions {
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
}
