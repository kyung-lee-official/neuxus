import { Elysia } from "elysia";
import { API_TAGS, bearerSecurity } from "../../shared/openapi.ts";
import { auth } from "../auth/index.ts";
import { deleteAllLogs } from "./dal.ts";
import { LogModel } from "./model.ts";
import { logSettings } from "./settings/index.ts";

const logDetail = {
  security: [bearerSecurity],
  tags: [API_TAGS.log],
};

/**
 * Admin log HTTP: sink settings at `/log/settings`, `app_log` purge at
 * `/log/purge`. The module's domain API (logger, settings, transport) is
 * exported from `index.ts`.
 */
export const logRoutes = new Elysia({ prefix: "/log" })
  .use(auth)
  .use(logSettings)
  .post("/purge", async () => ({ deleted: await deleteAllLogs() }), {
    requireAdmin: true,
    response: LogModel.logPurgeResponse,
    detail: {
      ...logDetail,
      summary: "Purge persisted log entries",
      description: "Deletes every row in `app_log`.",
    },
  });
