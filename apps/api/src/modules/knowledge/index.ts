import { Elysia } from "elysia";
import { API_TAGS, bearerSecurity } from "../../shared/openapi.ts";
import { auth } from "../auth/index.ts";
import { Knowledge } from "./service.ts";

export const knowledge = new Elysia({ prefix: "/knowledge" })
  .use(auth)
  .get("/pages", () => Knowledge.listPages(), {
    requireAdmin: true,
    detail: {
      tags: [API_TAGS.knowledge],
      summary: "List knowledge pages",
      description:
        "Returns every `kb_pages` row (no `body`). Each item carries parent/child counts.",
      security: [bearerSecurity],
    },
  })
  .get("/pages/*", ({ params }) => Knowledge.getPage(params["*"]), {
    requireAdmin: true,
    detail: {
      tags: [API_TAGS.knowledge],
      summary: "Fetch a single knowledge page",
      description:
        "Path is the page `slug` (may contain `/`). Includes `body` and `parents` (each with their `children`).",
      security: [bearerSecurity],
    },
  });
