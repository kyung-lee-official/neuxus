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
      summary: "List neuxus catalog text models",
      description:
        "Lists the text-capable catalog models in Anthropic's model-list shape. Informational only: `POST /v1/messages` ignores the request `model` and uses the configured `text-synthesis` model.",
    },
  });
