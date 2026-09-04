import { Elysia } from "elysia";
import { API_TAGS, bearerSecurity } from "../../../shared/openapi.ts";
import { auth } from "../../auth/index.ts";
import { ModelRegistryModel } from "./model.ts";
import { ModelRegistry } from "./service.ts";

const modelDetail = {
  security: [bearerSecurity],
  tags: [API_TAGS.serverSettingModel],
};

export const modelRegistry = new Elysia({ prefix: "/model" })
  .use(auth)
  .get("/", () => ModelRegistry.get(), {
    requireAdmin: true,
    response: ModelRegistryModel.modelResponse,
    detail: {
      ...modelDetail,
      summary: "Get the model registry config",
      description:
        "Returns the persisted per-provider connection map (`providerConnections`, keyed by catalog `providerId`) plus the task-pointer map (`tasks`) and the static catalog of providers and models used to render the UI.",
    },
  })
  .put("/", ({ body }) => ModelRegistry.put(body), {
    requireAdmin: true,
    body: ModelRegistryModel.modelBody,
    response: ModelRegistryModel.modelResponse,
    detail: {
      ...modelDetail,
      summary: "Update the model registry config",
      description:
        "`providerConnections` and `tasks` are each optional. Pass `null` for a connection to delete it; any task pointing at a model whose provider is no longer fully configured is auto-nulled on save.",
    },
  })
  .post("/test/:task", ({ body }) => ModelRegistry.test(body), {
    requireAdmin: true,
    body: ModelRegistryModel.modelTestBody,
    detail: {
      ...modelDetail,
      summary: "Run a one-shot test against a configured model",
      description:
        "Dispatches by `body.task`. Embedding takes `{ query, limit? }`; LLM takes `{ prompt }`; vision takes `{ imageBase64, mimeType?, name? }`. Image bytes never persist — only the response is returned.",
    },
  })
  .post("/test/embed", ({ body }) => ModelRegistry.testEmbed(body), {
    requireAdmin: true,
    body: ModelRegistryModel.testEmbedBody,
    response: ModelRegistryModel.testEmbedResponse,
    detail: {
      ...modelDetail,
      summary: "Embed a hardcoded diagnostic string with a specific model",
      description:
        "Embeds `Why is the sky blue?` via the catalog model in `body.modelId` over that model's provider's saved connection, and returns the raw vector plus model id. Used by the per-model \"Test embed\" button on the providers page. Does not require an embedding task to be assigned.",
    },
  });
