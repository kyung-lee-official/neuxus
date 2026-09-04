import { Elysia } from "elysia";
import { API_TAGS, bearerSecurity } from "../../shared/openapi.ts";
import { auth } from "../auth/index.ts";
import { ServerSettingModel } from "./model.ts";
import { ServerSetting } from "./service.ts";

const adminDetail = {
  tags: [API_TAGS.serverSetting],
  security: [bearerSecurity],
};

export const serverSetting = new Elysia({ prefix: "/server-setting" })
  .use(auth)
  // ---------- Model registry ----------
  .get("/model", () => ServerSetting.getModel(), {
    requireAdmin: true,
    response: ServerSettingModel.modelResponse,
    detail: {
      ...adminDetail,
      summary: "Get the model registry config",
      description:
        "Returns the persisted per-provider connection map (`providerConnections`, keyed by catalog `providerId`) plus the task-pointer map (`tasks`) and the static catalog of providers and models used to render the UI.",
    },
  })
  .put("/model", ({ body }) => ServerSetting.putModel(body), {
    requireAdmin: true,
    body: ServerSettingModel.modelBody,
    response: ServerSettingModel.modelResponse,
    detail: {
      ...adminDetail,
      summary: "Update the model registry config",
      description:
        "`providerConnections` and `tasks` are each optional. Pass `null` for a connection to delete it; any task pointing at a model whose provider is no longer fully configured is auto-nulled on save.",
    },
  })
  .post("/model/test/:task", ({ body }) => ServerSetting.testModel(body), {
    requireAdmin: true,
    body: ServerSettingModel.modelTestBody,
    detail: {
      ...adminDetail,
      summary: "Run a one-shot test against a configured model",
      description:
        "Dispatches by `body.task`. Embedding takes `{ query, limit? }`; LLM takes `{ prompt }`; vision takes `{ imageBase64, mimeType?, name? }`. Image bytes never persist — only the response is returned.",
    },
  })
  // ---------- Logs ----------
  .get("/log", () => ServerSetting.getLog(), {
    requireAdmin: true,
    detail: {
      ...adminDetail,
      summary: "Get log settings",
      description:
        "Returns the stored `app_log_settings` row (or nulls) plus hardcoded `defaults`. Shape: `{ sinks, queueSize, drainTimeoutMs, pretty, defaults, availableSinks }`. `sinks` and `availableSinks` are arrays of `'console' | 'postgres'`.",
    },
  })
  .put("/log", ({ body }) => ServerSetting.putLog(body), {
    requireAdmin: true,
    body: ServerSettingModel.logBody,
    detail: {
      ...adminDetail,
      summary: "Update log settings",
      description:
        "Empty / `null` fields are stored as null; runtime falls back to `defaults`. Returns the same shape as `GET /log`.",
    },
  })
  .post("/log/reset", () => ServerSetting.resetLog(), {
    requireAdmin: true,
    detail: {
      ...adminDetail,
      summary: "Reset log settings to defaults",
      description:
        "Writes hardcoded `LOG_DEFAULTS`: `sinks=['console']`, `queueSize=1000`, `drainTimeoutMs=2000`, `pretty=false`. Returns the same shape as `GET /log`.",
    },
  })
  .post("/log/purge", () => ServerSetting.purgeLogs(), {
    requireAdmin: true,
    response: ServerSettingModel.logPurgeResponse,
    detail: {
      ...adminDetail,
      summary: "Purge persisted log entries",
      description: "Deletes every row in `app_log`.",
    },
  })
  // ---------- Retrieve ----------
  .get("/retrieve", () => ServerSetting.getRetrieve(), {
    requireAdmin: true,
    response: ServerSettingModel.retrieveResponse,
    detail: {
      ...adminDetail,
      summary: "Get retrieve settings",
      description:
        "Returns the stored `kb_retrieve_settings` row (or nulls) plus hardcoded defaults.",
    },
  })
  .put("/retrieve", ({ body }) => ServerSetting.putRetrieve(body), {
    requireAdmin: true,
    body: ServerSettingModel.retrieveBody,
    response: ServerSettingModel.retrieveResponse,
    detail: {
      ...adminDetail,
      summary: "Update retrieve settings",
      description:
        "Empty / `null` fields store as null; runtime falls back to `defaults`.",
    },
  })
  .post("/retrieve/reset", () => ServerSetting.resetRetrieve(), {
    requireAdmin: true,
    response: ServerSettingModel.retrieveResponse,
    detail: {
      ...adminDetail,
      summary: "Reset retrieve settings to defaults",
      description:
        "Writes hardcoded `RETRIEVE_DEFAULTS`: `childLimit=24`, `maxParents=8`, `maxCharacters=12000`.",
    },
  })
  // ---------- Corpus ----------
  .get("/corpus", () => ServerSetting.getCorpus(), {
    requireAdmin: true,
    response: ServerSettingModel.corpusResponse,
    detail: {
      ...adminDetail,
      summary: "Get corpus settings",
      description:
        "Returns the stored `kb_corpus_settings` row (or nulls). `lastSyncedSha` is read-only.",
    },
  })
  .put("/corpus", ({ body }) => ServerSetting.putCorpus(body), {
    requireAdmin: true,
    body: ServerSettingModel.corpusBody,
    response: ServerSettingModel.corpusResponse,
    detail: {
      ...adminDetail,
      summary: "Update corpus settings",
      description:
        "Empty / `null` fields store as null. Null `repoUrl` means do not clone. `lastSyncedSha` is read-only (clone, pull, and a finished Sync write it).",
    },
  })
  .post("/corpus/clone", () => ServerSetting.cloneCorpus(), {
    requireAdmin: true,
    response: ServerSettingModel.corpusResponse,
    detail: {
      ...adminDetail,
      summary: "Clone the configured corpus repo",
      description:
        "`git clone` the saved `repoUrl` into `apps/api/data/corpus`. Optional saved `branch`. 409 if already cloned. 400 if no `repoUrl` is saved. Git must be on `PATH`; SSH uses the API process user's keys.",
    },
  })
  .post("/corpus/pull", () => ServerSetting.pullCorpus(), {
    requireAdmin: true,
    response: ServerSettingModel.corpusResponse,
    detail: {
      ...adminDetail,
      summary: "Fast-forward pull the corpus checkout",
      description:
        "`git fetch` + `git pull --ff-only`. 400 if not cloned yet, 400 if no `repoUrl` is saved.",
    },
  })
  .post("/corpus/chunkify", () => ServerSetting.chunkifyCorpus(), {
    requireAdmin: true,
    response: ServerSettingModel.corpusChunkifyResponse,
    detail: {
      ...adminDetail,
      summary: "Chunkify the corpus",
      description:
        "Re-chunk every page (replace each page's `kb_parents` and `kb_children`). Existing embeddings become stale; run `/server-setting/corpus/embed` or a full Sync next.",
    },
  })
  .post("/corpus/embed", () => ServerSetting.embedCorpus(), {
    requireAdmin: true,
    response: ServerSettingModel.corpusEmbedResponse,
    detail: {
      ...adminDetail,
      summary: "Embed stale corpus children",
      description:
        "Embeds children with null or stale `embeddingModel`. Fail-fast on provider errors.",
    },
  })
  .post("/corpus/sync", () => ServerSetting.startCorpusSync(), {
    requireAdmin: true,
    response: {
      202: ServerSettingModel.corpusSyncResponse,
    },
    detail: {
      ...adminDetail,
      summary: "Start a corpus sync",
      description:
        "Returns 202 and starts a background singleton Sync: clone-if-missing else pull, walk `docs_root`, ingest/chunkify/persist (hash skip), delete missing `source_path` rows, embed stale children, then write `last_synced_sha` from `HEAD`. Second concurrent operation of any kind returns 409. Fail-fast; no job table. In-process lock (one API process). Stream progress via `/server-setting/corpus/events`.",
    },
  })
  .get("/corpus/events", () => ServerSetting.corpusEvents(), {
    requireAdmin: true,
    response: ServerSettingModel.corpusEvent,
    detail: {
      ...adminDetail,
      summary: "Stream corpus sync events (SSE)",
      description:
        "Stay-open SSE. Sends a status snapshot on connect, then `{ running, operation, stage, progress, lastError }` updates and comment pings (every 15s) to keep the socket alive. Use `fetch` with `Authorization` — the browser `EventSource` API cannot set Bearer.",
    },
  })
  .post("/nuke", ({ body }) => ServerSetting.nuke(body), {
    requireAdmin: true,
    body: ServerSettingModel.nukeBody,
    response: ServerSettingModel.nukeResponse,
    detail: {
      ...adminDetail,
      summary: "Hard-wipe app tables",
      description:
        "Wipes the `public` schema on `DATABASE_URL` (including extensions). Does not remigrate or seed.",
    },
  });
