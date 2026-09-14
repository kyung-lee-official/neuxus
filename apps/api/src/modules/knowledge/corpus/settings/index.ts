import { Elysia } from "elysia";
import { API_TAGS, bearerSecurity } from "../../../../shared/openapi.ts";
import { auth } from "../../../auth/index.ts";
import { CorpusSettingsModel } from "./model.ts";
import { CorpusSettings } from "./service.ts";

const corpusSettingsDetail = {
  security: [bearerSecurity],
  tags: [API_TAGS.knowledgeCorpus],
};

/**
 * Corpus remote settings (`kb_corpus_settings` id `default`). Nested under
 * `/knowledge/corpus/settings`.
 */
export const corpusSettings = new Elysia({ prefix: "/settings" })
  .use(auth)
  .get("/", () => CorpusSettings.load(), {
    requireAdmin: true,
    response: CorpusSettingsModel.corpusResponse,
    detail: {
      ...corpusSettingsDetail,
      summary: "Get corpus settings",
      description:
        "Returns the stored `kb_corpus_settings` row (or nulls). `lastSyncedSha` is read-only.",
    },
  })
  .put("/", ({ body }) => CorpusSettings.save(body), {
    requireAdmin: true,
    body: CorpusSettingsModel.corpusBody,
    response: CorpusSettingsModel.corpusResponse,
    detail: {
      ...corpusSettingsDetail,
      summary: "Update corpus settings",
      description:
        "Empty / `null` fields store as null. Null `repoUrl` means do not clone. `lastSyncedSha` is read-only (clone, pull, and a finished Sync write it).",
    },
  });
