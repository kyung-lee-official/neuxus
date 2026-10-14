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
 * Corpus operations (clone / pull / chunkify / sync / SSE events), scoped to
 * one knowledge base: `/knowledge-bases/:kbId/corpus`. Settings live at
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
    "/chunkify",
    async ({ params }) => ({
      ok: true as const,
      ...(await Corpus.rechunk(params.kbId)),
    }),
    {
      requireAdmin: true,
      response: CorpusModel.corpusChunkifyResponse,
      detail: {
        ...corpusDetail,
        summary: "Chunkify the corpus",
        description:
          "Re-chunk every page (replace each page's `kb_parents` and `kb_children`). Existing embeddings become stale; run `/knowledge/corpus/embed` or a full Sync next.",
      },
    },
  )
  .post(
    "/sync",
    ({ params }) => {
      Corpus.sync(params.kbId);
      return status(202, { ok: true as const });
    },
    {
      requireAdmin: true,
      response: {
        202: CorpusModel.corpusSyncResponse,
      },
      detail: {
        ...corpusDetail,
        summary: "Start a corpus sync",
        description:
          "Returns 202 and starts a background singleton Sync: clone-if-missing else pull, walk the checkout, ingest/chunkify/persist (hash skip), delete rows for vanished files, embed stale children, then write `last_synced_sha` from `HEAD`. Second concurrent operation of any kind returns 409. Fail-fast; no job table. In-process lock (one API process). Stream progress via `/knowledge/corpus/events`.",
      },
    },
  )
  .get("/events", () => Corpus.events(), {
    requireAdmin: true,
    response: CorpusModel.corpusEvent,
    detail: {
      ...corpusDetail,
      summary: "Stream corpus sync events (SSE)",
      description:
        "Stay-open SSE. Sends a status snapshot on connect, then `{ running, operation, stage, progress, lastError }` updates and comment pings (every 15s) to keep the socket alive. Use `fetch` with `Authorization` — the browser `EventSource` API cannot set Bearer.",
    },
  });
