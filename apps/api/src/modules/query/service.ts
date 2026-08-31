import { status } from "elysia";
import {
  type AppMemory,
  type AppUser,
  getOrCreateSession,
  getPrisma,
  getSessionOwnedByUser,
  insertMemory,
  insertMessage,
  listRecentMessages,
  searchMemoriesByUserFTS,
} from "../../shared/db.ts";
import { isHttpStatus } from "../../shared/http.ts";
import {
  loadRetrieveSettings,
  retrieveParentsByQuestion,
} from "../../shared/retrieve/index.ts";
import { answerFromContext } from "./answer.ts";
import { slugForMemoryNote } from "./context.ts";
import type { QueryModel } from "./model.ts";

const MEMORY_SEARCH_LIMIT = 8;

/**
 * Search a user's memories for content related to the question.
 * Strategy: try Postgres FTS first; if no hits, fall back to the
 * user's most recent memories (still in scope).
 */
async function searchPersonalMemories(
  userId: string,
  question: string,
): Promise<AppMemory[]> {
  const trimmed = question.trim();
  if (trimmed) {
    const matched = await searchMemoriesByUserFTS(
      userId,
      trimmed,
      MEMORY_SEARCH_LIMIT,
    );
    if (matched.length > 0) return matched;
  }
  const rows = await getPrisma().memory.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: MEMORY_SEARCH_LIMIT,
  });
  return rows.map((Row) => ({
    id: Number(Row.id),
    user_id: Row.userId,
    slug: Row.slug,
    content: Row.content,
    created_at: Row.createdAt,
  }));
}

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
      const personalMemories = await searchPersonalMemories(user.id, message);
      const retrieveSettings = await loadRetrieveSettings();
      const { parents } = await retrieveParentsByQuestion(message, {
        ...retrieveSettings,
        userId: user.id,
      });
      const answer = await answerFromContext(
        recent,
        message,
        personalMemories,
        parents,
        { userId: user.id },
      );
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
