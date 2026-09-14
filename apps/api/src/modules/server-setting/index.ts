import { Elysia } from "elysia";
import { corpus } from "./corpus/index.ts";
import { logSettings } from "./log/index.ts";
import { nuke } from "./nuke/index.ts";
import { retrieveSettings } from "./retrieve/index.ts";
import { taskModelMap } from "./task-model-map/index.ts";

/**
 * Admin server settings — a composition root over one sub-module per
 * business area (task-model map, log settings, retrieve settings, corpus,
 * nuke). Each sub-module owns its routes, schemas (`model.ts`), and business
 * logic (`service.ts`). Model providers live in their own top-level module
 * (`modules/model-providers`, mounted at `/model-providers`).
 */
export const serverSetting = new Elysia({ prefix: "/server-setting" })
  .use(taskModelMap)
  .use(logSettings)
  .use(retrieveSettings)
  .use(corpus)
  .use(nuke);
