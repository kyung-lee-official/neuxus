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
  .get("/embed", () => ServerSetting.getEmbed(), {
    requireAdmin: true,
    detail: {
      ...adminDetail,
      summary: "Get embed settings",
      description:
        "Returns the stored `kb_embed_settings` row plus hardcoded defaults.",
    },
  })
  .put("/embed", ({ body }) => ServerSetting.putEmbed(body), {
    requireAdmin: true,
    body: ServerSettingModel.embedBody,
    detail: {
      ...adminDetail,
      summary: "Update embed settings",
      description:
        "Empty / `null` fields are stored as null; runtime falls back to defaults.",
    },
  })
  .post("/embed/reset", () => ServerSetting.resetEmbed(), {
    requireAdmin: true,
    detail: {
      ...adminDetail,
      summary: "Reset embed settings to defaults",
    },
  })
  .post(
    "/embed/test-search",
    ({ body }) => ServerSetting.testEmbedSearch(body),
    {
      requireAdmin: true,
      body: ServerSettingModel.embedTestSearchBody,
      detail: {
        ...adminDetail,
        summary: "Run a test embed search",
      },
    },
  )
  .get("/synthesis", () => ServerSetting.getSynthesis(), {
    requireAdmin: true,
    detail: {
      ...adminDetail,
      summary: "Get synthesis settings",
    },
  })
  .put("/synthesis", ({ body }) => ServerSetting.putSynthesis(body), {
    requireAdmin: true,
    body: ServerSettingModel.synthesisBody,
    detail: {
      ...adminDetail,
      summary: "Update synthesis settings",
    },
  })
  .post("/synthesis/reset", () => ServerSetting.resetSynthesis(), {
    requireAdmin: true,
    detail: {
      ...adminDetail,
      summary: "Reset synthesis settings to defaults",
    },
  })
  .get("/log", () => ServerSetting.getLog(), {
    requireAdmin: true,
    detail: {
      ...adminDetail,
      summary: "Get log settings",
    },
  })
  .put("/log", ({ body }) => ServerSetting.putLog(body), {
    requireAdmin: true,
    body: ServerSettingModel.logBody,
    detail: {
      ...adminDetail,
      summary: "Update log settings",
    },
  })
  .post("/log/reset", () => ServerSetting.resetLog(), {
    requireAdmin: true,
    detail: {
      ...adminDetail,
      summary: "Reset log settings to defaults",
    },
  })
  .post("/log/purge", () => ServerSetting.purgeLogs(), {
    requireAdmin: true,
    detail: {
      ...adminDetail,
      summary: "Purge persisted log entries",
    },
  })
  .get("/retrieve", () => ServerSetting.getRetrieve(), {
    requireAdmin: true,
    detail: {
      ...adminDetail,
      summary: "Get retrieve settings",
    },
  })
  .put("/retrieve", ({ body }) => ServerSetting.putRetrieve(body), {
    requireAdmin: true,
    body: ServerSettingModel.retrieveBody,
    detail: {
      ...adminDetail,
      summary: "Update retrieve settings",
    },
  })
  .post("/retrieve/reset", () => ServerSetting.resetRetrieve(), {
    requireAdmin: true,
    detail: {
      ...adminDetail,
      summary: "Reset retrieve settings to defaults",
    },
  })
  .get("/corpus", () => ServerSetting.getCorpus(), {
    requireAdmin: true,
    detail: {
      ...adminDetail,
      summary: "Get corpus settings",
    },
  })
  .put("/corpus", ({ body }) => ServerSetting.putCorpus(body), {
    requireAdmin: true,
    body: ServerSettingModel.corpusBody,
    detail: {
      ...adminDetail,
      summary: "Update corpus settings",
      description:
        "Empty / `null` fields store as null. `lastSyncedSha` is read-only.",
    },
  })
  .post("/corpus/clone", () => ServerSetting.cloneCorpus(), {
    requireAdmin: true,
    detail: {
      ...adminDetail,
      summary: "Clone the configured corpus repo",
      description:
        "Clones the saved `repoUrl` into `apps/api/data/corpus`. 409 if already cloned.",
    },
  })
  .post("/corpus/pull", () => ServerSetting.pullCorpus(), {
    requireAdmin: true,
    detail: {
      ...adminDetail,
      summary: "Fast-forward pull the corpus checkout",
      description: "400 if the corpus has not been cloned yet.",
    },
  })
  .post("/corpus/chunkify", () => ServerSetting.chunkifyCorpus(), {
    requireAdmin: true,
    detail: {
      ...adminDetail,
      summary: "Chunkify the corpus",
    },
  })
  .post("/corpus/embed", () => ServerSetting.embedCorpus(), {
    requireAdmin: true,
    detail: {
      ...adminDetail,
      summary: "Embed stale corpus children",
    },
  })
  .post("/corpus/sync", () => ServerSetting.startCorpusSync(), {
    requireAdmin: true,
    detail: {
      ...adminDetail,
      summary: "Start a corpus sync",
      description:
        "Returns 202. Second concurrent sync returns 409. Stream progress via `/server-setting/corpus/events`.",
    },
  })
  .get("/corpus/events", () => ServerSetting.corpusEvents(), {
    requireAdmin: true,
    detail: {
      ...adminDetail,
      summary: "Stream corpus sync events (SSE)",
      description:
        "Snapshot on connect, then `{ running, stage, lastError }` updates. Comment pings keep the socket alive.",
    },
  })
  .post("/nuke", ({ body }) => ServerSetting.nuke(body), {
    requireAdmin: true,
    body: ServerSettingModel.nukeBody,
    detail: {
      ...adminDetail,
      summary: "Hard-wipe app tables",
      description:
        "Wipes the `public` schema on `DATABASE_URL`. Does not remigrate or seed.",
    },
  });
