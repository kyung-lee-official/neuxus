import { Elysia } from "elysia";
import { corpus } from "./corpus/index.ts";
import { logSettings } from "./log/index.ts";
import { modelProviders } from "./model-providers/index.ts";
import { nuke } from "./nuke/index.ts";
import { retrieveSettings } from "./retrieve/index.ts";

/**
 * Admin server settings — a composition root over one sub-module per
 * business area (model providers, log settings, retrieve settings, corpus,
 * nuke). Each sub-module owns its routes, schemas (`model.ts`), and
 * business logic (`service.ts`).
 */
export const serverSetting = new Elysia({ prefix: "/server-setting" })
  .use(modelProviders)
  .use(logSettings)
  .use(retrieveSettings)
  .use(corpus)
  .use(nuke);
