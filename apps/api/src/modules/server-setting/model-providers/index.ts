import { Elysia } from "elysia";
import { API_TAGS, bearerSecurity } from "../../../shared/openapi.ts";
import { auth } from "../../auth/index.ts";
import { ModelProvidersModel, providerIdParams } from "./model.ts";
import { ModelProviders } from "./service.ts";

const modelProvidersDetail = {
  security: [bearerSecurity],
  tags: [API_TAGS.serverSettingModelProviders],
};

/**
 * Model providers admin: static catalog + per-provider connections +
 * per-model diagnostics. Task→model assignment lives in `/task-model-map`.
 */
export const modelProviders = new Elysia({ prefix: "/model-providers" })
  .use(auth)
  .get("/providers", () => ModelProviders.getProviders(), {
    requireAdmin: true,
    response: ModelProvidersModel.providersResponse,
    detail: {
      ...modelProvidersDetail,
      summary: "List catalog providers (with their models)",
      description:
        "Returns the static catalog: every provider with the models it serves, nested.",
    },
  })
  .get(
    "/providers/:providerId/connection",
    ({ params }) => ModelProviders.getConnection(params.providerId),
    {
      requireAdmin: true,
      params: providerIdParams,
      response: ModelProvidersModel.connectionResponse,
      detail: {
        ...modelProvidersDetail,
        summary: "Read a provider's saved connection",
        description:
          "Returns the saved connection payload for one provider (validated per provider), or `connection: null` when unset.",
      },
    },
  )
  .put(
    "/providers/:providerId/connection",
    ({ params, body }) => ModelProviders.putConnection(params.providerId, body),
    {
      requireAdmin: true,
      params: providerIdParams,
      body: ModelProvidersModel.connectionBody,
      response: ModelProvidersModel.connectionResponse,
      detail: {
        ...modelProvidersDetail,
        summary: "Save a provider's connection",
        description:
          "Validates the payload against the provider's own connection schema and persists it. Use DELETE to clear.",
      },
    },
  )
  .delete(
    "/providers/:providerId/connection",
    ({ params }) => ModelProviders.deleteConnection(params.providerId),
    {
      requireAdmin: true,
      params: providerIdParams,
      response: ModelProvidersModel.deleteResponse,
      detail: {
        ...modelProvidersDetail,
        summary: "Clear a provider's saved connection",
        description: "Removes the saved connection payload for one provider.",
      },
    },
  )
  .post(
    "/providers/:providerId/test/embed",
    ({ params, body }) => ModelProviders.testEmbed(params.providerId, body),
    {
      requireAdmin: true,
      params: providerIdParams,
      body: ModelProvidersModel.embedTestBody,
      response: ModelProvidersModel.embedTestResponse,
      detail: {
        ...modelProvidersDetail,
        summary: "Embed a diagnostic string with a specific model",
        description:
          "Runs the provider's embed against `body.modelId` and returns the raw vector.",
      },
    },
  )
  .post(
    "/providers/:providerId/test/chat",
    ({ params, body }) => ModelProviders.testChat(params.providerId, body),
    {
      requireAdmin: true,
      params: providerIdParams,
      body: ModelProvidersModel.chatTestBody,
      response: ModelProvidersModel.textTestResponse,
      detail: {
        ...modelProvidersDetail,
        summary: "Chat with a specific model",
        description:
          "One-shot text chat with the fixed prompt `Hello!` against `body.modelId` over the provider's saved connection.",
      },
    },
  )
  .post(
    "/providers/:providerId/test/image",
    ({ params, body }) => ModelProviders.testImage(params.providerId, body),
    {
      requireAdmin: true,
      params: providerIdParams,
      body: ModelProvidersModel.imageTestBody,
      response: ModelProvidersModel.textTestResponse,
      detail: {
        ...modelProvidersDetail,
        summary: "Chat with a specific model over an image",
        description:
          "Sends the bundled `assets/test-image-chat.jpg` with the fixed prompt `What is in this image?` to `body.modelId` and returns the text reply.",
      },
    },
  );
