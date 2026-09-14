import { Elysia } from "elysia";
import { API_TAGS, bearerSecurity } from "../../../../shared/openapi.ts";
import { auth } from "../../../auth/index.ts";
import { RetrieverSettingsModel } from "./model.ts";
import { RetrieverSettings } from "./service.ts";

const retrieveDetail = {
  security: [bearerSecurity],
  tags: [API_TAGS.knowledgeRetriever],
};

/**
 * Retriever settings (`kb_retrieve_settings` id `default`), served under
 * `/knowledge/retriever/settings`.
 */
export const retrieverSettings = new Elysia({ prefix: "/retriever/settings" })
  .use(auth)
  .get("/", () => RetrieverSettings.loadAdmin(), {
    requireAdmin: true,
    response: RetrieverSettingsModel.retrieverResponse,
    detail: {
      ...retrieveDetail,
      summary: "Get retrieve settings",
      description:
        "Returns the stored `kb_retrieve_settings` row (or nulls) plus hardcoded defaults.",
    },
  })
  .put(
    "/",
    async ({ body }) => {
      await RetrieverSettings.save(body);
      return RetrieverSettings.loadAdmin();
    },
    {
      requireAdmin: true,
      body: RetrieverSettingsModel.retrieverBody,
      response: RetrieverSettingsModel.retrieverResponse,
      detail: {
        ...retrieveDetail,
        summary: "Update retrieve settings",
        description:
          "Empty / `null` fields store as null; runtime falls back to `defaults`.",
      },
    },
  )
  .post("/reset", () => RetrieverSettings.reset(), {
    requireAdmin: true,
    response: RetrieverSettingsModel.retrieverResponse,
    detail: {
      ...retrieveDetail,
      summary: "Reset retrieve settings to defaults",
      description:
        "Writes hardcoded `RETRIEVE_DEFAULTS`: `childLimit=24`, `maxParents=8`, `maxCharacters=12000`.",
    },
  });
