import { Elysia } from "elysia";
import { API_TAGS, bearerSecurity } from "../../../shared/openapi.ts";
import { serviceAuth } from "../../neuxus-auth/index.ts";
import { NukeModel } from "./model.ts";
import { Nuke } from "./service.ts";

const nukeDetail = {
  security: [bearerSecurity],
  tags: [API_TAGS.serverSettingNuke],
};

export const nuke = new Elysia()
  .use(serviceAuth)
  .post("/nuke", ({ body }) => Nuke.wipe(body), {
    requireService: true,
    body: NukeModel.nukeBody,
    response: NukeModel.nukeResponse,
    detail: {
      ...nukeDetail,
      summary: "Hard-wipe app tables",
      description:
        "Wipes the `public` schema on `DATABASE_URL` (including extensions). Does not remigrate or seed.",
    },
  });
