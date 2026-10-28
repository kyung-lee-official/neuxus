import { Elysia } from "elysia";
import { API_TAGS } from "../../shared/openapi.ts";

export const health = new Elysia().get("/health", () => ({ ok: true }), {
  detail: {
    tags: [API_TAGS.health],
    summary: "Liveness check",
    description: "Returns `{ ok: true }` when the API process is running.",
  },
});
