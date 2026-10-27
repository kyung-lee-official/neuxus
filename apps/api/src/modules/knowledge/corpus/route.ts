import { Elysia, status } from "elysia";
import { API_TAGS, bearerSecurity } from "../../../shared/openapi.ts";
import { auth } from "../../auth/index.ts";
import { CorpusGitError } from "../errors.ts";
import { CorpusModel } from "./model.ts";
import { Corpus, CorpusLockedError } from "./service.ts";
import { CorpusSettingsModel } from "./settings/model.ts";

const corpusDetail = {
  security: [bearerSecurity],
  tags: [API_TAGS.knowledgeCorpus],
};

/**
 * Corpus operations (clone / pull / ingest / chunkify / caption / SSE
 * events), scoped to one knowledge base: `/knowledge-bases/:kbId/corpus`. Settings live at
 * `/knowledge-bases/:kbId/corpus/settings`.
 */
export const corpus = new Elysia({ prefix: "/knowledge-bases/:kbId/corpus" })
  .use(auth)
  .onError(({ error }) => {
    if (error instanceof CorpusGitError || error instanceof CorpusLockedError) {
      return status(error.httpStatus, { error: error.message });
    }
  })
  .post("/clone", ({ params }) => Corpus.clone(params.kbId), {
    requireAdmin: true,
    response: CorpusSettingsModel.corpusResponse,
    detail: {
      ...corpusDetail,
      summary: "Clone the configured corpus repo",
      description:
        "`git clone` the saved `repoUrl` into `apps/api/data/corpus`. Optional saved `branch`. 409 if already cloned. 400 if no `repoUrl` is saved. Git must be on `PATH`; SSH uses the API process user's keys.",
    },
  })
  .post("/pull", ({ params }) => Corpus.pull(params.kbId), {
    requireAdmin: true,
    response: CorpusSettingsModel.corpusResponse,
    detail: {
      ...corpusDetail,
      summary: "Fast-forward pull the corpus checkout",
      description:
        "`git fetch` + `git pull --ff-only`. 400 if not cloned yet, 400 if no `repoUrl` is saved.",
    },
  })
  .post(
    "/ingest",
    async ({ params }) => ({
      ok: true as const,
      ...(await Corpus.ingest(params.kbId)),
    }),
    {
      requireAdmin: true,
      response: CorpusModel.corpusIngestResponse,
      detail: {
        ...corpusDetail,
        summary: "Ingest the checkout",
        description:
          "Walk the checkout, upsert `kb_pages` (hash skip), and write image rows. Fail-fast on a body/`*.meta.yaml` mismatch. Needs a checkout — Clone first.",
      },
    },
  )
  .post(
    "/chunkify",
    ({ params }) => {
      Corpus.rechunk(params.kbId);
      return status(202, { ok: true as const });
    },
    {
      requireAdmin: true,
      response: {
        202: CorpusModel.corpusAcceptedResponse,
      },
      detail: {
        ...corpusDetail,
        summary: "Chunkify the corpus",
        description:
          "Re-chunk every page (replace each page's `kb_parents` and `kb_children`) and re-embed the children. Needs ingested pages — run Ingest first. Returns 202 and runs in the background; second concurrent operation of any kind returns 409. Stream progress via `/knowledge-bases/:kbId/corpus/events`.",
      },
    },
  )
  .post(
    "/caption",
    async ({ params }) => ({
      ok: true as const,
      ...(await Corpus.caption(params.kbId)),
    }),
    {
      requireAdmin: true,
      response: CorpusModel.corpusCaptionResponse,
      detail: {
        ...corpusDetail,
        summary: "Caption + embed image descriptions",
        description:
          "Re-caption stale `vision-captioning` images and embed the descriptions. Needs a checkout (image bytes) and a linked caption model.",
      },
    },
  )
  .get("/events", () => Corpus.events(), {
    requireAdmin: true,
    response: CorpusModel.corpusEvent,
    detail: {
      ...corpusDetail,
      summary: "Stream corpus operation events (SSE)",
      description:
        "Stay-open SSE. Sends a status snapshot on connect, then `{ running, operation, stage, progress, lastError }` updates and comment pings (every 15s) to keep the socket alive. Use `fetch` with `Authorization` — the browser `EventSource` API cannot set Bearer.",
    },
  });
