import { type Static, t } from "elysia";

/** One persisted per-provider connection (`app_model_provider_config.providerConnections`). */
const connectionSchema = t.Object({
  apiKey: t.Union([t.String(), t.Null()]),
  baseUrl: t.Union([t.String({ format: "uri" }), t.Null()], {
    error: "baseUrl must be a valid URI",
  }),
  port: t.Union([t.Integer({ minimum: 1, maximum: 65535 }), t.Null()]),
});

const providerSchema = t.Object({
  id: t.String(),
  displayName: t.String(),
  baseUrl: t.String(),
  requestShape: t.Union([
    t.Literal("anthropic-messages"),
    t.Literal("openai-embeddings"),
    t.Literal("ollama-embed"),
  ]),
  headers: t.Optional(t.Record(t.String(), t.String())),
  userInputs: t.Array(
    t.Union([t.Literal("apiKey"), t.Literal("baseUrl"), t.Literal("port")]),
  ),
});

const modelSchema = t.Object({
  id: t.String(),
  providerId: t.String(),
  displayName: t.String(),
  capabilities: t.Object({
    embedding: t.Optional(t.Literal(true)),
    llm: t.Optional(t.Literal(true)),
    vision: t.Optional(t.Literal(true)),
  }),
  defaults: t.Object({
    contextWindowTokens: t.Optional(t.Integer()),
    maxOutputTokens: t.Optional(t.Integer()),
    embeddingDimensions: t.Optional(t.Integer()),
    temperature: t.Optional(t.Number()),
  }),
});

export const ModelProvidersModel = {
  /**
   * GET /model-providers response: saved per-provider connections + the
   * static catalog. App task→model assignment is a separate resource
   * (`/model-tasks`).
   */
  response: t.Object({
    config: t.Object({
      providerConnections: t.Record(t.String(), connectionSchema),
    }),
    providers: t.Array(providerSchema),
    models: t.Array(modelSchema),
  }),

  /** PUT /model-providers body: partial per-provider connections. */
  putBody: t.Object({
    providerConnections: t.Optional(t.Record(t.String(), connectionSchema)),
  }),

  /** POST /model-providers/test/embed body: which catalog model to embed with. */
  embedBody: t.Object({
    modelId: t.String(),
  }),

  /** POST /model-providers/test/embed response: raw vector from the embedder. */
  embedResponse: t.Object({
    embedding: t.Array(t.Number()),
    modelId: t.String(),
    dim: t.Integer({ minimum: 1 }),
    inputText: t.String(),
  }),
} as const;

export type ModelProvidersModel = {
  [K in keyof typeof ModelProvidersModel]: Static<
    (typeof ModelProvidersModel)[K]
  >;
};
