import { Elysia } from "elysia";
import { API_TAGS, bearerSecurity } from "../../shared/openapi.ts";
import { requestIdFrom } from "../../shared/protocol.ts";
import { serviceAuth } from "../neuxus-auth/index.ts";
import { Messages } from "./service.ts";

/** Anthropic-compatible, knowledge-enriched message endpoint. */
export const messages = new Elysia().use(serviceAuth).post(
  "/v1/messages",
  ({ body, headers, request }) =>
    Messages.synthesize({
      body,
      headers: headers as Record<string, unknown>,
      requestId: requestIdFrom(request),
    }),
  {
    requireService: true,
    detail: {
      security: [bearerSecurity],
      tags: [API_TAGS.messages],
      summary: "Enriched Anthropic message",
      description:
        "Accepts the Anthropic Messages API, injects one `<knowledge>` block into the last human turn, forwards the request, and returns the provider response plus the `neuxus` extension. Requires `x-api-key` (or Bearer), `anthropic-version`, and `X-Neuxus-Knowledge-Base`.",
    },
  },
);
