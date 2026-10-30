import { Elysia } from "elysia";
import { API_TAGS, bearerSecurity } from "../../shared/openapi.ts";
import { requestIdFrom } from "../../shared/protocol.ts";
import { serviceAuth } from "../neuxus-auth/index.ts";
import { Retrieve } from "./service.ts";

/** Evidence-only endpoint (no LLM call). */
export const retrieve = new Elysia()
  .use(serviceAuth)
  .post(
    "/retrieve",
    ({ body, request }) =>
      Retrieve.retrieve({ body, requestId: requestIdFrom(request) }),
    {
      requireService: true,
      detail: {
        security: [bearerSecurity],
        tags: [API_TAGS.retrieve],
        summary: "Retrieve knowledge-base evidence",
        description:
          "Runs the same retrieval as `/v1/messages` against one knowledge base and returns ranked parents, image-description hits, signals, and optional raw child hits. No LLM call.",
      },
    },
  );
