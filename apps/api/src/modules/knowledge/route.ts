import { Elysia } from "elysia";
import { API_TAGS, bearerSecurity } from "../../shared/openapi.ts";
import { serviceAuth } from "../neuxus-auth/index.ts";
import { corpus } from "./corpus/route.ts";
import { corpusSettings } from "./corpus/settings/route.ts";
import { knowledgeBases } from "./knowledge-bases/route.ts";
import { KnowledgeModel } from "./model.ts";
import { retrieverSettings } from "./retriever/settings/route.ts";
import { Knowledge } from "./service.ts";

const pageDetail = {
  security: [bearerSecurity],
  tags: [API_TAGS.knowledge],
};

/** Page inspection routes, scoped to one knowledge base. */
const knowledgePages = new Elysia({ prefix: "/knowledge-bases/:kbId" })
  .use(serviceAuth)
  .get("/pages", ({ params }) => Knowledge.listPages(params.kbId), {
    requireService: true,
    response: KnowledgeModel.pageListResponse,
    detail: {
      ...pageDetail,
      summary: "List knowledge pages",
      description:
        "Inspect every `kb_pages` row of the knowledge base (no `body`). Each item carries parent/child counts. Read-only.",
    },
  })
  .get(
    "/pages/*",
    ({ params }) => Knowledge.getPage(params.kbId, params["*"]),
    {
      requireService: true,
      response: KnowledgeModel.pageDetailResponse,
      detail: {
        ...pageDetail,
        summary: "Fetch a single knowledge page",
        description:
          "Path is the page `id` (may contain `/`, e.g. `guide/install`). 404 if missing. Includes `body` and `parents` (ordered by `parentIndex`), each with their `children` (ordered by `childIndex`). Does not return embedding vectors.",
      },
    },
  )
  .get(
    "/images",
    ({ params, query }) =>
      Knowledge.listImages(params.kbId, {
        pageId: query.pageId,
        policy: query.policy,
      }),
    {
      requireService: true,
      response: KnowledgeModel.imageListResponse,
      detail: {
        ...pageDetail,
        summary: "List knowledge images",
        description:
          "Inspect the knowledge base's `kb_image_descriptions` rows (no embedding vector). Optional `pageId` / `policy` filters.",
      },
    },
  );

/**
 * Knowledge module: the base registry (`/knowledge-bases`), the per-base
 * content + corpus routes (`/knowledge-bases/:kbId/...`), and the global
 * retriever knobs (`/retriever/settings`).
 */
export const knowledge = new Elysia()
  .use(serviceAuth)
  .use(knowledgeBases)
  .use(knowledgePages)
  .use(corpus)
  .use(corpusSettings)
  .use(retrieverSettings);
