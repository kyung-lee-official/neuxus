import { Elysia } from "elysia";
import { API_TAGS, bearerSecurity } from "../../shared/openapi.ts";
import { auth } from "../auth/index.ts";
import { LogsModel } from "./model.ts";
import { Logs } from "./service.ts";

export const logs = new Elysia({ prefix: "/logs" })
  .use(auth)
  .get("/", ({ user, query }) => Logs.listForUser(user, query), {
    requireUser: true,
    query: LogsModel.listQuery,
    response: LogsModel.listResponse,
    detail: {
      tags: [API_TAGS.logs],
      summary: "List logs for the current user",
      description:
        "Returns child-logger entries scoped to the bearer user. Defaults to `names=synthesis,retrieve`, `limit=50`.",
      security: [bearerSecurity],
    },
  });
