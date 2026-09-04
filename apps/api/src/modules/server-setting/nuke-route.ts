import { Elysia } from "elysia";
import { API_TAGS, bearerSecurity } from "../../shared/openapi.ts";
import { auth } from "../auth/index.ts";
import { ServerSettingModel } from "./model.ts";
import { ServerSetting } from "./service.ts";

const nukeDetail = {
  security: [bearerSecurity],
  tags: [API_TAGS.serverSettingNuke],
};

export const nukeRoute = new Elysia()
  .use(auth)
  .post("/nuke", ({ body }) => ServerSetting.nuke(body), {
    requireAdmin: true,
    body: ServerSettingModel.nukeBody,
    response: ServerSettingModel.nukeResponse,
    detail: {
      ...nukeDetail,
      summary: "Hard-wipe app tables",
      description:
        "Wipes the `public` schema on `DATABASE_URL` (including extensions). Does not remigrate or seed.",
    },
  });
