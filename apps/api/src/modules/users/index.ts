import { Elysia } from "elysia";
import { auth } from "../auth/index.ts";
import { Auth } from "../auth/service.ts";
import { UsersModel } from "./model.ts";
import { Users } from "./service.ts";

export const users = new Elysia({ prefix: "/users" })
  .use(auth)
  .get("/", () => Users.list())
  .post(
    "/",
    async ({ headers, body }) => {
      const actor = await Auth.resolveUserFromHeaders(headers);
      return Users.create(actor, body);
    },
    {
      body: UsersModel.createBody,
    },
  )
  .get("/:id/data", ({ params, query }) => Users.getData(params.id, query), {
    requireUser: true,
    params: UsersModel.idParams,
    query: UsersModel.dataQuery,
  })
  .delete(
    "/:id/memories/:memoryId",
    ({ params }) => Users.deleteMemory(params.id, params.memoryId),
    {
      requireUser: true,
      params: UsersModel.memoryParams,
    },
  )
  .get("/:id", ({ params }) => Users.get(params.id), {
    params: UsersModel.idParams,
  })
  .patch("/:id", ({ params, body }) => Users.update(params.id, body), {
    requireUser: true,
    params: UsersModel.idParams,
    body: UsersModel.updateBody,
  })
  .delete("/:id", ({ params }) => Users.remove(params.id), {
    requireUser: true,
    params: UsersModel.idParams,
  });
