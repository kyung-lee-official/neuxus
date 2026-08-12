import { Elysia } from "elysia";
import { auth } from "../auth/index.ts";
import { SessionsModel } from "./model.ts";
import { Sessions } from "./service.ts";

export const sessions = new Elysia({ prefix: "/sessions" })
  .use(auth)
  .get("/", ({ user }) => Sessions.list(user), { requireUser: true })
  .post("/", ({ user }) => Sessions.create(user), { requireUser: true })
  .patch(
    "/:sessionId",
    ({ user, params, body }) => Sessions.patch(user, params.sessionId, body),
    {
      requireUser: true,
      params: SessionsModel.sessionParams,
      body: SessionsModel.patchBody,
    },
  );
