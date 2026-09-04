import { Elysia } from "elysia";
import { corpusRoute } from "./corpus-route.ts";
import { logRoute } from "./log-route.ts";
import { modelRoute } from "./model-route.ts";
import { nukeRoute } from "./nuke-route.ts";
import { retrieveRoute } from "./retrieve-route.ts";

/** Admin server settings — each endpoint family is a sibling sub-module route. */
export const serverSetting = new Elysia({ prefix: "/server-setting" })
  .use(modelRoute)
  .use(logRoute)
  .use(retrieveRoute)
  .use(corpusRoute)
  .use(nukeRoute);
