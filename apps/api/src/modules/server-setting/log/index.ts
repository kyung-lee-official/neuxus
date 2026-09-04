import { Elysia } from "elysia";
import { API_TAGS, bearerSecurity } from "../../../shared/openapi.ts";
import { auth } from "../../auth/index.ts";
import { LogSettingsModel } from "./model.ts";
import { LogSettings } from "./service.ts";

const logDetail = {
  security: [bearerSecurity],
  tags: [API_TAGS.serverSettingLog],
};

export const logSettings = new Elysia({ prefix: "/log" })
  .use(auth)
  .get("/", () => LogSettings.get(), {
    requireAdmin: true,
    detail: {
      ...logDetail,
      summary: "Get log settings",
      description:
        "Returns the stored `app_log_settings` row (or nulls) plus hardcoded `defaults`. Shape: `{ sinks, queueSize, drainTimeoutMs, pretty, defaults, availableSinks }`. `sinks` and `availableSinks` are arrays of `'console' | 'postgres'`.",
    },
  })
  .put("/", ({ body }) => LogSettings.put(body), {
    requireAdmin: true,
    body: LogSettingsModel.logBody,
    detail: {
      ...logDetail,
      summary: "Update log settings",
      description:
        "Empty / `null` fields are stored as null; runtime falls back to `defaults`. Returns the same shape as `GET /log`.",
    },
  })
  .post("/reset", () => LogSettings.reset(), {
    requireAdmin: true,
    detail: {
      ...logDetail,
      summary: "Reset log settings to defaults",
      description:
        "Writes hardcoded `LOG_DEFAULTS`: `sinks=['console']`, `queueSize=1000`, `drainTimeoutMs=2000`, `pretty=false`. Returns the same shape as `GET /log`.",
    },
  })
  .post("/purge", () => LogSettings.purge(), {
    requireAdmin: true,
    response: LogSettingsModel.logPurgeResponse,
    detail: {
      ...logDetail,
      summary: "Purge persisted log entries",
      description: "Deletes every row in `app_log`.",
    },
  });
