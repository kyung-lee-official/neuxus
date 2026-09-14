import { Elysia } from "elysia";
import { nuke } from "./nuke/route.ts";
import { taskModelMap } from "./task-model-map/route.ts";

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
