import { Elysia } from "elysia";
import { API_TAGS, bearerSecurity } from "../../shared/openapi.ts";
import { auth } from "../auth/index.ts";
import { SessionsModel } from "./model.ts";
import { Sessions } from "./service.ts";

export const sessions = new Elysia({ prefix: "/sessions" })
  .use(auth)
  .get("/", ({ user }) => Sessions.list(user), {
    requireUser: true,
    detail: {
      tags: [API_TAGS.sessions],
      summary: "List the current user's sessions",
      security: [bearerSecurity],
    },
  })
  .post("/", ({ user }) => Sessions.create(user), {
    requireUser: true,
    detail: {
      tags: [API_TAGS.sessions],
      summary: "Create a session",
      security: [bearerSecurity],
    },
  })
  .patch(
    "/:sessionId",
    ({ user, params, body }) => Sessions.patch(user, params.sessionId, body),
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
    ({ user, params }) => Sessions.delete(user, params.sessionId),
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
