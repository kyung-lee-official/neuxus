import { status } from "elysia";
import { type AppUser } from "../../shared/db.ts";
import { isHttpStatus } from "../../shared/http.ts";
import {
  loadRetrieveSettings,
  retrieveParentsByQuestion,
} from "../../shared/retrieve/index.ts";
import { ChatMessage } from "../chat-messages/service.ts";
import { ChatSession } from "../chat-sessions/service.ts";
import { PersonalMemory } from "../personal-memory/service.ts";
import { answerFromContext } from "./answer.ts";
import type { QueryModel } from "./model.ts";

export abstract class Query {
  static async ask(user: AppUser, body: QueryModel["queryBody"]) {
    const message = body.message.trim();
    if (!message) throw status(400, { error: "message is required" });

    try {
      const requested = body.sessionId?.trim();
      let sessionId: string;
      if (requested) {
        const owned = await ChatSession.getOwnedByUser(requested, user.id);
        if (!owned) throw status(404, { error: "Session not found" });
        sessionId = owned.id;
      } else {
        sessionId = await ChatSession.getOrCreate(user.id);
      }
      const recent = await ChatMessage.listRecentBySession(sessionId);
      const personalMemories = await PersonalMemory.search(user.id, message);
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
        user.id,
      );
      await ChatMessage.insert(sessionId, "user", message);
      await ChatMessage.insert(sessionId, "assistant", answer);
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
    const memory = await PersonalMemory.upsert(user.id, content);
    return {
      userId: user.id,
      slug: memory.slug,
      saved: true as const,
    };
  }
}
