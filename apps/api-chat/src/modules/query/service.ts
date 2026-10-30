import { ElysiaCustomStatusResponse, status } from "elysia";
import { ChatMessage } from "../personal-data/chat-messages/service.ts";
import { ChatSession } from "../personal-data/chat-sessions/service.ts";
import { PersonalMemory } from "../personal-data/personal-memory/service.ts";
import { type AppUser } from "../users/service.ts";
import { chatMessages, chatSystem } from "./context.ts";
import { askNeuxus, NeuxusClientError } from "./core-client.ts";
import type { QueryModel } from "./model.ts";

const CHAT_MODEL = "deepseek::deepseek-flash";
const CHAT_MAX_TOKENS = 4096;

export abstract class Query {
  static async ask(user: AppUser, body: QueryModel["queryBody"]) {
    const message = body.message.trim();
    if (!message) throw status(400, { error: "message is required" });
    const knowledgeBaseId = body.knowledgeBaseId.trim();
    if (!knowledgeBaseId) {
      throw status(400, { error: "knowledgeBaseId is required" });
    }

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
      const memories = await PersonalMemory.search(user.id, message);
      const result = await askNeuxus({
        knowledgeBaseId,
        body: {
          model: CHAT_MODEL,
          max_tokens: CHAT_MAX_TOKENS,
          system: chatSystem(memories),
          messages: chatMessages(recent, message),
          metadata: { user_id: user.id },
        },
      });

      await ChatMessage.insert(sessionId, "user", message);
      await ChatMessage.insert(sessionId, "assistant", result.answer);
      return {
        userId: user.id,
        sessionId,
        mode: "ask" as const,
        answer: result.answer,
      };
    } catch (err) {
      if (err instanceof ElysiaCustomStatusResponse) throw err;
      if (err instanceof NeuxusClientError) {
        const statusCode =
          err.status === 401 || err.status === 403 ? 502 : err.status;
        throw status(statusCode, { error: err.message });
      }
      const messageFromError = err instanceof Error ? err.message : String(err);
      throw status(502, { error: messageFromError });
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
