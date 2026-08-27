import { Elysia } from "elysia";
import { auth } from "../auth/index.ts";
import { ServerSettingModel } from "./model.ts";
import { ServerSetting } from "./service.ts";

export const serverSetting = new Elysia({ prefix: "/server-setting" })
  .use(auth)
  .get("/embed", () => ServerSetting.getEmbed(), {
    requireAdmin: true,
  })
  .put("/embed", ({ body }) => ServerSetting.putEmbed(body), {
    requireAdmin: true,
    body: ServerSettingModel.embedBody,
  })
  .post("/embed/reset", () => ServerSetting.resetEmbed(), {
    requireAdmin: true,
  })
  .post(
    "/embed/test-search",
    ({ body }) => ServerSetting.testEmbedSearch(body),
    {
      requireAdmin: true,
      body: ServerSettingModel.embedTestSearchBody,
    },
  )
  .get("/synthesis", () => ServerSetting.getSynthesis(), {
    requireAdmin: true,
  })
  .put("/synthesis", ({ body }) => ServerSetting.putSynthesis(body), {
    requireAdmin: true,
    body: ServerSettingModel.synthesisBody,
  })
  .post("/synthesis/reset", () => ServerSetting.resetSynthesis(), {
    requireAdmin: true,
  })
  .get("/log", () => ServerSetting.getLog(), {
    requireAdmin: true,
  })
  .put("/log", ({ body }) => ServerSetting.putLog(body), {
    requireAdmin: true,
    body: ServerSettingModel.logBody,
  })
  .post("/log/reset", () => ServerSetting.resetLog(), {
    requireAdmin: true,
  })
  .post("/log/purge", () => ServerSetting.purgeLogs(), {
    requireAdmin: true,
  })
  .get("/retrieve", () => ServerSetting.getRetrieve(), {
    requireAdmin: true,
  })
  .put("/retrieve", ({ body }) => ServerSetting.putRetrieve(body), {
    requireAdmin: true,
    body: ServerSettingModel.retrieveBody,
  })
  .post("/retrieve/reset", () => ServerSetting.resetRetrieve(), {
    requireAdmin: true,
  })
  .get("/corpus", () => ServerSetting.getCorpus(), {
    requireAdmin: true,
  })
  .put("/corpus", ({ body }) => ServerSetting.putCorpus(body), {
    requireAdmin: true,
    body: ServerSettingModel.corpusBody,
  })
  .post("/corpus/clone", () => ServerSetting.cloneCorpus(), {
    requireAdmin: true,
  })
  .post("/corpus/pull", () => ServerSetting.pullCorpus(), {
    requireAdmin: true,
  })
  .post("/corpus/chunkify", () => ServerSetting.chunkifyCorpus(), {
    requireAdmin: true,
  })
  .post("/corpus/embed", () => ServerSetting.embedCorpus(), {
    requireAdmin: true,
  })
  .post("/corpus/sync", () => ServerSetting.startCorpusSync(), {
    requireAdmin: true,
  })
  .get("/corpus/events", () => ServerSetting.corpusEvents(), {
    requireAdmin: true,
  })
  .post("/nuke", ({ body }) => ServerSetting.nuke(body), {
    requireAdmin: true,
    body: ServerSettingModel.nukeBody,
  });
