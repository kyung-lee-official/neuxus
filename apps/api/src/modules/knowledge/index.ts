import { Elysia } from "elysia";
import { API_TAGS, bearerSecurity } from "../../shared/openapi.ts";
import { auth } from "../auth/index.ts";
import { KnowledgeModel } from "./model.ts";
import { Knowledge } from "./service.ts";

export const knowledge = new Elysia({ prefix: "/knowledge" })
  .use(auth)
  .get("/pages", () => Knowledge.listPages(), {
    requireAdmin: true,
    response: KnowledgeModel.pageListResponse,
    detail: {
      tags: [API_TAGS.knowledge],
      summary: "List knowledge pages",
      description:
        "Inspect every `kb_pages` row (no `body`). Each item carries parent/child counts. Read-only.",
      security: [bearerSecurity],
    },
  })
  .get("/pages/*", ({ params }) => Knowledge.getPage(params["*"]), {
    requireAdmin: true,
    response: KnowledgeModel.pageDetailResponse,
    detail: {
      tags: [API_TAGS.knowledge],
      summary: "Fetch a single knowledge page",
      description:
        "Path is the page `slug` (may contain `/`, e.g. `guide/install`). 404 if missing. Includes `body` and `parents` (ordered by `parentIndex`), each with their `children` (ordered by `childIndex`). Does not return embedding vectors.",
      security: [bearerSecurity],
    },
  });
