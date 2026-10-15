import { Elysia, status } from "elysia";
import { API_TAGS, bearerSecurity } from "../../../shared/openapi.ts";
import { auth } from "../../auth/index.ts";
import { KnowledgeBases } from "./index.ts";
import { KnowledgeBasesModel } from "./model.ts";

const knowledgeBaseDetail = {
  security: [bearerSecurity],
  tags: [API_TAGS.knowledge],
};

/**
 * Knowledge-base registry (`kb_knowledge_bases`): the root entity every page,
 * chunk, and search is scoped to. A base is either corpus-backed
 * (`writable: false`) or written directly (`writable: true`).
 */
export const knowledgeBases = new Elysia({ prefix: "/knowledge-bases" })
  .use(auth)
  .get("/", async () => ({ knowledgeBases: await KnowledgeBases.list() }), {
    requireAdmin: true,
    response: KnowledgeBasesModel.listResponse,
    detail: {
      ...knowledgeBaseDetail,
      summary: "List knowledge bases",
      description: "Every knowledge base, oldest first.",
    },
  })
  .post("/", ({ body }) => KnowledgeBases.create(body), {
    requireAdmin: true,
    body: KnowledgeBasesModel.createBody,
    response: KnowledgeBasesModel.knowledgeBaseResponse,
    detail: {
      ...knowledgeBaseDetail,
      summary: "Create a knowledge base",
      description:
        "`id` is a lowercase slug (unique). `writable` defaults to false (corpus-backed). 409 if the id already exists.",
    },
  })
  .get(
    "/:kbId",
    async ({ params }) => {
      const kb = await KnowledgeBases.get(params.kbId);
      if (!kb) throw status(404, { error: "Knowledge base not found" });
      return kb;
    },
    {
      requireAdmin: true,
      response: KnowledgeBasesModel.knowledgeBaseResponse,
      detail: {
        ...knowledgeBaseDetail,
        summary: "Get a knowledge base",
        description: "404 when the id does not exist.",
      },
    },
  )
  .patch(
    "/:kbId",
    ({ params, body }) => KnowledgeBases.update(params.kbId, body),
    {
      requireAdmin: true,
      body: KnowledgeBasesModel.updateBody,
      response: KnowledgeBasesModel.knowledgeBaseResponse,
      detail: {
        ...knowledgeBaseDetail,
        summary: "Update a knowledge base",
        description: "Update `name`. 404 when missing.",
      },
    },
  )
  .delete(
    "/:kbId",
    async ({ params }) => {
      await KnowledgeBases.remove(params.kbId);
      return { deleted: true as const, id: params.kbId };
    },
    {
      requireAdmin: true,
      response: KnowledgeBasesModel.deletedResponse,
      detail: {
        ...knowledgeBaseDetail,
        summary: "Delete a knowledge base",
        description:
          "Cascades to its pages, chunks, and settings. 404 when missing.",
      },
    },
  );
