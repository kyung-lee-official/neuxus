import { status } from "elysia";
import { answerFromContext } from "../../answer.ts";
import { slugForMemoryNote } from "../../context.ts";
import type { AppUser } from "../../db.ts";
import {
  getOrCreateSession,
  getSessionOwnedByUser,
  insertMemory,
  insertMessage,
  listRecentMessages,
  searchMemoriesByUser,
} from "../../db.ts";
import { isHttpStatus } from "../../shared/http.ts";
import type { QueryModel } from "./model.ts";

export abstract class Query {
  static async ask(user: AppUser, body: QueryModel["queryBody"]) {
    const message = body.message.trim();
    if (!message) throw status(400, { error: "message is required" });

    try {
      const requested = body.sessionId?.trim();
      let sessionId: string;
      if (requested) {
        const owned = await getSessionOwnedByUser(requested, user.id);
        if (!owned) throw status(404, { error: "Session not found" });
        sessionId = owned.id;
      } else {
        sessionId = await getOrCreateSession(user.id);
      }
      const recent = await listRecentMessages(sessionId);
      const personalMemories = await searchMemoriesByUser(user.id, message);
      const answer = await answerFromContext(recent, message, personalMemories);
      await insertMessage(sessionId, "user", message);
      await insertMessage(sessionId, "assistant", answer);
      return {
        userId: user.id,
        sessionId,
        mode: "ask" as const,
        answer,
      };
    } catch (err) {
      if (isHttpStatus(err)) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      throw status(502, { error: msg });
    }
  }

  static async remember(user: AppUser, body: QueryModel["rememberBody"]) {
    const content = body.content.trim();
    if (!content) throw status(400, { error: "content is required" });

    const slug = slugForMemoryNote();
    const memory = await insertMemory(user.id, slug, content);

    return {
      userId: user.id,
      slug: memory.slug,
      saved: true as const,
    };
  }
}
