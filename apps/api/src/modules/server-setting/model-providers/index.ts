import { Elysia } from "elysia";
import { API_TAGS, bearerSecurity } from "../../../shared/openapi.ts";
import { auth } from "../../auth/index.ts";
import { ModelProvidersModel } from "./model.ts";
import { ModelProviders } from "./service.ts";

const modelProvidersDetail = {
  security: [bearerSecurity],
  tags: [API_TAGS.serverSettingModelProviders],
};

/**
 * Provider model registry: saved per-provider connections + static catalog
 * + per-model diagnostics. Business-agnostic — app task→model assignment
 * is administered separately under `/model-tasks`.
 */
export const modelProviders = new Elysia({ prefix: "/model-providers" })
  .use(auth)
  .get("/", () => ModelProviders.get(), {
    requireAdmin: true,
    response: ModelProvidersModel.response,
    detail: {
      ...modelProvidersDetail,
      summary: "Get model providers and their saved connections",
      description:
        "Returns the persisted per-provider connection map (`providerConnections`, keyed by catalog `providerId`) plus the static catalog of providers and models. App task→model assignment lives under `/model-tasks`.",
    },
  })
  .put("/", ({ body }) => ModelProviders.put(body), {
    requireAdmin: true,
    body: ModelProvidersModel.putBody,
    response: ModelProvidersModel.response,
    detail: {
      ...modelProvidersDetail,
      summary: "Update provider connections",
      description:
        "Partial update of `providerConnections`. Pass an empty connection (`{ apiKey: null, baseUrl: null, port: null }`) to delete it. A task whose model's provider is no longer fully configured is auto-nulled (the task assignment row is updated in the same transaction).",
    },
  })
  .post("/test/embed", ({ body }) => ModelProviders.testEmbed(body), {
    requireAdmin: true,
    body: ModelProvidersModel.embedBody,
    response: ModelProvidersModel.embedResponse,
    detail: {
      ...modelProvidersDetail,
      summary: "Embed a hardcoded diagnostic string with a specific model",
      description:
        'Embeds `Why is the sky blue?` via the catalog model in `body.modelId` (under provider `body.providerId`) over that provider\'s saved connection, and returns the raw vector plus model id. Used by the per-model "Test embed" button on the providers page. Does not require an embedding task to be assigned.',
    },
  })
  .post("/test/chat", ({ body }) => ModelProviders.testChat(body), {
    requireAdmin: true,
    body: ModelProvidersModel.chatBody,
    response: ModelProvidersModel.chatResponse,
    detail: {
      ...modelProvidersDetail,
      summary: "Run a one-shot chat with a specific model",
      description:
        "Sends the vendor's official sample chat request via the catalog model in `body.modelId` (under provider `body.providerId`) over that provider's saved connection, and returns the model's reply plus model id. Used by the per-model \"Test chat\" button on the providers page. Does not require an text task to be assigned.",
    },
  });
