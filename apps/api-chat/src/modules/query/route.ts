import { Elysia, status } from "elysia";
import { API_TAGS, bearerSecurity } from "../../shared/openapi.ts";
import { auth } from "../auth/index.ts";
import { QueryModel } from "./model.ts";
import { Query } from "./service.ts";

export const query = new Elysia()
  .use(auth)
  .post(
    "/query",
    () =>
      status(501, {
        error: "Chat is being refactored. Use settings and memory for now.",
      }),
    {
      requireUser: true,
      body: QueryModel.queryBody,
      detail: {
        tags: [API_TAGS.query],
        summary: "Ask the assistant (stub)",
        description:
          "Chat synthesis is being refactored. This endpoint currently returns 501.",
        security: [bearerSecurity],
      },
    },
  )
  .post("/remember", ({ user, body }) => Query.remember(user, body), {
    requireUser: true,
    body: QueryModel.rememberBody,
    response: QueryModel.rememberResponse,
    detail: {
      tags: [API_TAGS.query],
      summary: "Store a personal memory note",
      security: [bearerSecurity],
    },
  });
