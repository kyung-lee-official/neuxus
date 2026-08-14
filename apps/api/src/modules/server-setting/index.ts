import { Elysia } from "elysia";
import { auth } from "../auth/index.ts";
import { ServerSettingModel } from "./model.ts";
import { ServerSetting } from "./service.ts";

export const serverSetting = new Elysia({ prefix: "/server-setting" })
  .use(auth)
  .get("/embed", () => ServerSetting.getEmbed(), {
    requireAdmin: true,
  })
  .put("/embed", ({ body }) => ServerSetting.putEmbed(body), {
    requireAdmin: true,
    body: ServerSettingModel.embedBody,
  })
  .post("/nuke", ({ body }) => ServerSetting.nuke(body), {
    requireAdmin: true,
    body: ServerSettingModel.nukeBody,
  });
