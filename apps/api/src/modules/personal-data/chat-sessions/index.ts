import { Elysia } from "elysia";
import { API_TAGS, bearerSecurity } from "../../shared/openapi.ts";
import { auth } from "../auth/index.ts";
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
