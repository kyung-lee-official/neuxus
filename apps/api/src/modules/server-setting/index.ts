import { Elysia } from "elysia";
import { logSettings } from "./log/index.ts";
import { nuke } from "./nuke/index.ts";
import { retrieveSettings } from "./retrieve/index.ts";
import { taskModelMap } from "./task-model-map/index.ts";

/**
 * Admin server settings — a composition root over one sub-module per
 * business area (task-model map, log settings, retrieve settings, nuke).
 * Each sub-module owns its routes, schemas (`model.ts`), and business logic
 * (`service.ts`). Model providers live in their own top-level module
 * (`modules/model-providers`, mounted at `/model-providers`); corpus lives
 * in the knowledge module (`modules/knowledge/corpus`, mounted at
 * `/knowledge/corpus`).
 */
export const serverSetting = new Elysia({ prefix: "/server-setting" })
  .use(taskModelMap)
  .use(logSettings)
  .use(retrieveSettings)
  .use(nuke);
