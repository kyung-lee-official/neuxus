import { Elysia } from "elysia";
import { API_TAGS, bearerSecurity } from "../../shared/openapi.ts";
import { auth } from "../auth/index.ts";
import { Auth } from "../auth/service.ts";
import { UsersModel } from "./model.ts";
import { Users } from "./service.ts";

export const users = new Elysia({ prefix: "/users" })
  .use(auth)
  .get("/", () => Users.list(), {
    detail: {
      tags: [API_TAGS.users],
      summary: "List users",
      description:
        "Returns every user (id, apiKey, role, createdAt). Public endpoint.",
    },
  })
  .post(
    "/",
    async ({ headers, body }) => {
      const actor = await Auth.resolveUserFromHeaders(headers);
      return Users.create(actor, body);
    },
    {
      body: UsersModel.createBody,
      detail: {
        tags: [API_TAGS.users],
        summary: "Create a user",
        description:
          "First user in an empty database becomes admin; later users are members. Requires Bearer when any users already exist.",
        security: [bearerSecurity],
      },
    },
  )
  .get("/:id/data", ({ params, query }) => Users.getData(params.id, query), {
    requireUser: true,
    params: UsersModel.idParams,
    query: UsersModel.dataQuery,
    detail: {
      tags: [API_TAGS.users],
      summary: "Get a user's memories, sessions, and messages",
      security: [bearerSecurity],
    },
  })
  .delete(
    "/:id/memories/:memoryId",
    ({ params }) => Users.deleteMemory(params.id, params.memoryId),
    {
      requireUser: true,
      params: UsersModel.memoryParams,
      detail: {
        tags: [API_TAGS.users],
        summary: "Delete a personal memory for a user",
        security: [bearerSecurity],
      },
    },
  )
  .get("/:id", ({ params }) => Users.get(params.id), {
    params: UsersModel.idParams,
    detail: {
      tags: [API_TAGS.users],
      summary: "Get a user by id",
      description: "Public endpoint used by the sign-in screen.",
    },
  })
  .patch("/:id", ({ params, body }) => Users.update(params.id, body), {
    requireUser: true,
    params: UsersModel.idParams,
    body: UsersModel.updateBody,
    detail: {
      tags: [API_TAGS.users],
      summary: "Update a user",
      description: "Currently used to rotate or set the user's apiKey.",
      security: [bearerSecurity],
    },
  })
  .delete("/:id", ({ params }) => Users.remove(params.id), {
    requireUser: true,
    params: UsersModel.idParams,
    detail: {
      tags: [API_TAGS.users],
      summary: "Delete a user",
      security: [bearerSecurity],
    },
  });
