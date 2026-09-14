import { Elysia } from "elysia";
import { nuke } from "./nuke/index.ts";
import { taskModelMap } from "./task-model-map/index.ts";

/**
 * Admin server settings — a composition root over one sub-module per
 * business area (task-model map, nuke). Each sub-module owns its routes,
 * schemas (`model.ts`), and business logic (`service.ts`). Model providers,
 * log, corpus, and retriever settings live in their own modules
 * (`/model-providers`, `/log/settings`, `/knowledge/corpus`,
 * `/knowledge/retriever/settings`).
 */
export const serverSetting = new Elysia({ prefix: "/server-setting" })
  .use(taskModelMap)
  .use(nuke);
