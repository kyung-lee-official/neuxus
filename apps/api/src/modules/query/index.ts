import { Elysia } from "elysia";
import { auth } from "../auth/index.ts";
import { QueryModel } from "./model.ts";
import { Query } from "./service.ts";

export const query = new Elysia()
  .use(auth)
  .post("/query", ({ user, body }) => Query.ask(user, body), {
    requireUser: true,
    body: QueryModel.queryBody,
  })
  .post("/remember", ({ user, body }) => Query.remember(user, body), {
    requireUser: true,
    body: QueryModel.rememberBody,
  });
