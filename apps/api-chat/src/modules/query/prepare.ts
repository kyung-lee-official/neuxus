import { status } from "elysia";
import { ChatMessage } from "../personal-data/chat-messages/service.ts";
import { ChatSession } from "../personal-data/chat-sessions/service.ts";
import { PersonalMemory } from "../personal-data/personal-memory/service.ts";
import { type AppUser } from "../users/service.ts";
import { chatMessages, chatSystem } from "./context.ts";
import type { QueryModel } from "./model.ts";

const CHAT_MODEL = "deepseek::deepseek-flash";
const CHAT_MAX_TOKENS = 4096;

export type PreparedAsk = {
  sessionId: string;
  message: string;
  knowledgeBaseId: string;
  requestBody: Record<string, unknown>;
};

/** Resolve the session, history, memory, and initial model request. */
export async function prepareAsk(
  user: AppUser,
  body: QueryModel["queryBody"],
): Promise<PreparedAsk> {
  const message = body.message.trim();
  if (!message) throw status(400, { error: "message is required" });
  const knowledgeBaseId = body.knowledgeBaseId.trim();
  if (!knowledgeBaseId) {
    throw status(400, { error: "knowledgeBaseId is required" });
  }

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
  return {
    sessionId,
    message,
    knowledgeBaseId,
    requestBody: {
      model: CHAT_MODEL,
      max_tokens: CHAT_MAX_TOKENS,
      system: chatSystem(memories),
      messages: chatMessages(recent, message),
      metadata: { user_id: user.id },
    },
  };
}
