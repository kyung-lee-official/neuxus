import { Elysia } from "elysia";
import { API_TAGS, bearerSecurity } from "../../shared/openapi.ts";
import { serviceAuth } from "../neuxus-auth/index.ts";
import { Models } from "./service.ts";

/** Anthropic-compatible model list. */
export const models = new Elysia()
  .use(serviceAuth)
  .get("/v1/models", () => Models.list(), {
    requireService: true,
    detail: {
      security: [bearerSecurity],
      tags: [API_TAGS.models],
      summary: "List neuxus model ids",
      description:
        "Lists the text-capable catalog model ids a client may send to `POST /v1/messages`, in Anthropic's model-list shape.",
    },
  });
