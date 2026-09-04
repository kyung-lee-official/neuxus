import { Elysia } from "elysia";
import { API_TAGS, bearerSecurity } from "../../shared/openapi.ts";
import { auth } from "../auth/index.ts";
import { ServerSettingModel } from "./model.ts";
import { ServerSetting } from "./service.ts";

const modelDetail = {
  security: [bearerSecurity],
  tags: [API_TAGS.serverSettingModel],
};

export const modelRoute = new Elysia({ prefix: "/model" })
  .use(auth)
  .get("/", () => ServerSetting.getModel(), {
    requireAdmin: true,
    response: ServerSettingModel.modelResponse,
    detail: {
      ...modelDetail,
      summary: "Get the model registry config",
      description:
        "Returns the persisted per-provider connection map (`providerConnections`, keyed by catalog `providerId`) plus the task-pointer map (`tasks`) and the static catalog of providers and models used to render the UI.",
    },
  })
  .put("/", ({ body }) => ServerSetting.putModel(body), {
    requireAdmin: true,
    body: ServerSettingModel.modelBody,
    response: ServerSettingModel.modelResponse,
    detail: {
      ...modelDetail,
      summary: "Update the model registry config",
      description:
        "`providerConnections` and `tasks` are each optional. Pass `null` for a connection to delete it; any task pointing at a model whose provider is no longer fully configured is auto-nulled on save.",
    },
  })
  .post("/test/:task", ({ body }) => ServerSetting.testModel(body), {
    requireAdmin: true,
    body: ServerSettingModel.modelTestBody,
    detail: {
      ...modelDetail,
      summary: "Run a one-shot test against a configured model",
      description:
        "Dispatches by `body.task`. Embedding takes `{ query, limit? }`; LLM takes `{ prompt }`; vision takes `{ imageBase64, mimeType?, name? }`. Image bytes never persist — only the response is returned.",
    },
  })
  .post("/test/embed", ({ body }) => ServerSetting.testEmbed(body), {
    requireAdmin: true,
    body: ServerSettingModel.testEmbedBody,
    response: ServerSettingModel.testEmbedResponse,
    detail: {
      ...modelDetail,
      summary: "Embed a hardcoded diagnostic string with a specific model",
      description:
        "Embeds `Why is the sky blue?` via the catalog model in `body.modelId` over that model's provider's saved connection, and returns the raw vector plus model id. Used by the per-model \"Test embed\" button on the providers page. Does not require an embedding task to be assigned.",
    },
  });
