import { Elysia } from "elysia";
import { API_TAGS, bearerSecurity } from "../../shared/openapi.ts";
import { auth } from "../auth/index.ts";
import { ServerSettingModel } from "./model.ts";
import { ServerSetting } from "./service.ts";

const corpusDetail = {
  security: [bearerSecurity],
  tags: [API_TAGS.serverSettingCorpus],
};

export const corpusRoute = new Elysia({ prefix: "/corpus" })
  .use(auth)
  .get("/", () => ServerSetting.getCorpus(), {
    requireAdmin: true,
    response: ServerSettingModel.corpusResponse,
    detail: {
      ...corpusDetail,
      summary: "Get corpus settings",
      description:
        "Returns the stored `kb_corpus_settings` row (or nulls). `lastSyncedSha` is read-only.",
    },
  })
  .put("/", ({ body }) => ServerSetting.putCorpus(body), {
    requireAdmin: true,
    body: ServerSettingModel.corpusBody,
    response: ServerSettingModel.corpusResponse,
    detail: {
      ...corpusDetail,
      summary: "Update corpus settings",
      description:
        "Empty / `null` fields store as null. Null `repoUrl` means do not clone. `lastSyncedSha` is read-only (clone, pull, and a finished Sync write it).",
    },
  })
  .post("/clone", () => ServerSetting.cloneCorpus(), {
    requireAdmin: true,
    response: ServerSettingModel.corpusResponse,
    detail: {
      ...corpusDetail,
      summary: "Clone the configured corpus repo",
      description:
        "`git clone` the saved `repoUrl` into `apps/api/data/corpus`. Optional saved `branch`. 409 if already cloned. 400 if no `repoUrl` is saved. Git must be on `PATH`; SSH uses the API process user's keys.",
    },
  })
  .post("/pull", () => ServerSetting.pullCorpus(), {
    requireAdmin: true,
    response: ServerSettingModel.corpusResponse,
    detail: {
      ...corpusDetail,
      summary: "Fast-forward pull the corpus checkout",
      description:
        "`git fetch` + `git pull --ff-only`. 400 if not cloned yet, 400 if no `repoUrl` is saved.",
    },
  })
  .post("/chunkify", () => ServerSetting.chunkifyCorpus(), {
    requireAdmin: true,
    response: ServerSettingModel.corpusChunkifyResponse,
    detail: {
      ...corpusDetail,
      summary: "Chunkify the corpus",
      description:
        "Re-chunk every page (replace each page's `kb_parents` and `kb_children`). Existing embeddings become stale; run `/server-setting/corpus/embed` or a full Sync next.",
    },
  })
  .post("/embed", () => ServerSetting.embedCorpus(), {
    requireAdmin: true,
    response: ServerSettingModel.corpusEmbedResponse,
    detail: {
      ...corpusDetail,
      summary: "Embed stale corpus children",
      description:
        "Embeds children with null or stale `embeddingModel`. Fail-fast on provider errors.",
    },
  })
  .post("/sync", () => ServerSetting.startCorpusSync(), {
    requireAdmin: true,
    response: {
      202: ServerSettingModel.corpusSyncResponse,
    },
    detail: {
      ...corpusDetail,
      summary: "Start a corpus sync",
      description:
        "Returns 202 and starts a background singleton Sync: clone-if-missing else pull, walk `docs_root`, ingest/chunkify/persist (hash skip), delete missing `source_path` rows, embed stale children, then write `last_synced_sha` from `HEAD`. Second concurrent operation of any kind returns 409. Fail-fast; no job table. In-process lock (one API process). Stream progress via `/server-setting/corpus/events`.",
    },
  })
  .get("/events", () => ServerSetting.corpusEvents(), {
    requireAdmin: true,
    response: ServerSettingModel.corpusEvent,
    detail: {
      ...corpusDetail,
      summary: "Stream corpus sync events (SSE)",
      description:
        "Stay-open SSE. Sends a status snapshot on connect, then `{ running, operation, stage, progress, lastError }` updates and comment pings (every 15s) to keep the socket alive. Use `fetch` with `Authorization` — the browser `EventSource` API cannot set Bearer.",
    },
  });
