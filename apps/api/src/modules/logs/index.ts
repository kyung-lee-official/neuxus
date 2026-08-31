import { Elysia } from "elysia";
import { auth } from "../auth/index.ts";
import { LogsModel } from "./model.ts";
import { Logs } from "./service.ts";

export const logs = new Elysia({ prefix: "/logs" })
  .use(auth)
  .get("/", ({ user, query }) => Logs.listForUser(user, query), {
    requireUser: true,
    query: LogsModel.listQuery,
    response: LogsModel.listResponse,
  });
