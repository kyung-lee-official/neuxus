import { Elysia } from "elysia";
import { API_TAGS, bearerSecurity } from "../../shared/openapi.ts";
import { auth } from "../auth/index.ts";
import { ServerSettingModel } from "./model.ts";
import { ServerSetting } from "./service.ts";

const retrieveDetail = {
  security: [bearerSecurity],
  tags: [API_TAGS.serverSettingRetrieve],
};

export const retrieveRoute = new Elysia({ prefix: "/retrieve" })
  .use(auth)
  .get("/", () => ServerSetting.getRetrieve(), {
    requireAdmin: true,
    response: ServerSettingModel.retrieveResponse,
    detail: {
      ...retrieveDetail,
      summary: "Get retrieve settings",
      description:
        "Returns the stored `kb_retrieve_settings` row (or nulls) plus hardcoded defaults.",
    },
  })
  .put("/", ({ body }) => ServerSetting.putRetrieve(body), {
    requireAdmin: true,
    body: ServerSettingModel.retrieveBody,
    response: ServerSettingModel.retrieveResponse,
    detail: {
      ...retrieveDetail,
      summary: "Update retrieve settings",
      description:
        "Empty / `null` fields store as null; runtime falls back to `defaults`.",
    },
  })
  .post("/reset", () => ServerSetting.resetRetrieve(), {
    requireAdmin: true,
    response: ServerSettingModel.retrieveResponse,
    detail: {
      ...retrieveDetail,
      summary: "Reset retrieve settings to defaults",
      description:
        "Writes hardcoded `RETRIEVE_DEFAULTS`: `childLimit=24`, `maxParents=8`, `maxCharacters=12000`.",
    },
  });
