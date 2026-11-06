import { Elysia } from "elysia";
import { API_TAGS, bearerSecurity } from "../../../shared/openapi.ts";
import { serviceAuth } from "../../neuxus-auth/index.ts";
import { LogSettingsModel } from "./model.ts";
import { LogSettings } from "./service.ts";

const logDetail = {
  security: [bearerSecurity],
  tags: [API_TAGS.log],
};

/**
 * Log sink settings (`app_log_settings` id `default`), served under
 * `/log/settings`.
 */
export const logSettings = new Elysia({ prefix: "/settings" })
  .use(serviceAuth)
  .get("/", () => LogSettings.admin(), {
    requireService: true,
    detail: {
      ...logDetail,
      summary: "Get log settings",
      description:
        "Returns the stored `app_log_settings` row (or nulls) plus hardcoded `defaults`. Shape: `{ sinks, queueSize, drainTimeoutMs, pretty, defaults, availableSinks }`. Supported `sinks` are `['postgres']` and `['console', 'postgres']`; `postgres` is mandatory. `availableSinks` lists the available sink values.",
    },
  })
  .put(
    "/",
    async ({ body }) => {
      await LogSettings.save(body);
      return LogSettings.admin();
    },
    {
      requireService: true,
      body: LogSettingsModel.logBody,
      detail: {
        ...logDetail,
        summary: "Update log settings",
        description:
          "Supported sink sets are `['postgres']` and `['console', 'postgres']`; `postgres` is mandatory. Empty / `null` fields are stored as null and fall back to `defaults`. Returns the same shape as `GET /log/settings`.",
      },
    },
  )
  .post("/reset", () => LogSettings.reset(), {
    requireService: true,
    detail: {
      ...logDetail,
      summary: "Reset log settings to defaults",
      description:
        "Writes hardcoded `LOG_DEFAULTS`: `sinks=['console', 'postgres']`, `queueSize=1000`, `drainTimeoutMs=2000`, `pretty=false`. Returns the same shape as `GET /log/settings`.",
    },
  });
