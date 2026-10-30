import { Elysia, status } from "elysia";
import { API_TAGS, bearerSecurity } from "../../../shared/openapi.ts";
import { isoFromDate } from "../../../shared/serialize.ts";
import { auth } from "../../auth/index.ts";
import { ChatMessage } from "../chat-messages/service.ts";
import { SessionsModel } from "./model.ts";
import { ChatSession } from "./service.ts";

export const chatSessions = new Elysia({ prefix: "/sessions" })
  .use(auth)
  .get("/", ({ user }) => ChatSession.list(user), {
    requireUser: true,
    detail: {
      tags: [API_TAGS.sessions],
      summary: "List the current user's sessions",
      security: [bearerSecurity],
    },
  })
  .post("/", ({ user }) => ChatSession.create(user), {
    requireUser: true,
    detail: {
      tags: [API_TAGS.sessions],
      summary: "Create a session",
      security: [bearerSecurity],
    },
  })
  .get(
    "/:sessionId/messages",
    async ({ user, params }) => {
      const owned = await ChatSession.getOwnedByUser(params.sessionId, user.id);
      if (!owned) throw status(404, { error: "Session not found" });
      const messages = await ChatMessage.listRecentBySession(owned.id, 100);
      return {
        messages: messages.map((message) => ({
          id: message.id,
          role: message.role,
          content: message.content,
          createdAt: isoFromDate(message.created_at),
        })),
      };
    },
    {
      requireUser: true,
      detail: {
        tags: [API_TAGS.sessions],
        summary: "List the current session's messages",
        security: [bearerSecurity],
      },
    },
  )
  .patch(
    "/:sessionId",
    ({ user, params, body }) => ChatSession.patch(user, params.sessionId, body),
    {
      requireUser: true,
      params: SessionsModel.sessionParams,
      body: SessionsModel.patchBody,
      detail: {
        tags: [API_TAGS.sessions],
        summary: "Rename or clear a session title",
        security: [bearerSecurity],
      },
    },
  )
  .delete(
    "/:sessionId",
    ({ user, params }) => ChatSession.delete(user, params.sessionId),
    {
      requireUser: true,
      params: SessionsModel.sessionParams,
      detail: {
        tags: [API_TAGS.sessions],
        summary: "Delete a session",
        security: [bearerSecurity],
      },
    },
  );
