import { Elysia } from "elysia";
import { AdminModel } from "./model.ts";
import { Admin } from "./service.ts";

export const admin = new Elysia({ prefix: "/admin" }).post(
  "/nuke",
  async ({ body }) => Admin.nuke(body),
  {
    body: AdminModel.nukeBody,
  },
);
