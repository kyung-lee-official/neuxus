import { Elysia } from "elysia";
import { API_TAGS, bearerSecurity } from "../../shared/openapi.ts";
import { auth } from "../auth/index.ts";
import { QueryModel } from "./model.ts";
import { Query } from "./service.ts";

export const query = new Elysia()
  .use(auth)
  .post("/query", ({ user, body }) => Query.ask(user, body), {
    requireUser: true,
    body: QueryModel.queryBody,
    response: QueryModel.queryResponse,
    detail: {
      tags: [API_TAGS.query],
      summary: "Ask the assistant",
      description:
        "Loads the user's session history and personal memory, calls neuxus `/v1/messages` for knowledge-base-enriched synthesis, and persists the user and assistant messages.",
      security: [bearerSecurity],
    },
  })
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
