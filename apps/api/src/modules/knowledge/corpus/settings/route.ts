import { Elysia } from "elysia";
import { API_TAGS, bearerSecurity } from "../../../../shared/openapi.ts";
import { serviceAuth } from "../../../neuxus-auth/index.ts";
import { CorpusSettingsModel } from "./model.ts";
import { CorpusSettings } from "./service.ts";

const corpusSettingsDetail = {
  security: [bearerSecurity],
  tags: [API_TAGS.knowledgeCorpus],
};

/**
 * Corpus remote settings (`kb_corpus_settings`, one row per knowledge base),
 * served under `/knowledge-bases/:kbId/corpus/settings`.
 */
export const corpusSettings = new Elysia({
  prefix: "/knowledge-bases/:kbId/corpus/settings",
})
  .use(serviceAuth)
  .get("/", ({ params }) => CorpusSettings.load(params.kbId), {
    requireService: true,
    response: CorpusSettingsModel.corpusResponse,
    detail: {
      ...corpusSettingsDetail,
      summary: "Get corpus settings",
      description:
        "Returns the stored `kb_corpus_settings` row (or nulls). `lastSyncedSha` is read-only.",
    },
  })
  .put("/", ({ params, body }) => CorpusSettings.save(params.kbId, body), {
    requireService: true,
    body: CorpusSettingsModel.corpusBody,
    response: CorpusSettingsModel.corpusResponse,
    detail: {
      ...corpusSettingsDetail,
      summary: "Update corpus settings",
      description:
        "Empty / `null` fields store as null. Null `repoUrl` means do not clone. `lastSyncedSha` is read-only (clone and pull write it).",
    },
  });
