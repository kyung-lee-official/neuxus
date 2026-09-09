import { type Static, t } from "elysia";

/** A provider connection payload is provider-specific; validated per provider in the DAL/catalog. */
const connectionValueSchema = t.Any();

const providerSchema = t.Object({
  id: t.String(),
  displayName: t.String(),
  baseUrl: t.Optional(t.String({ format: "uri" })),
  headers: t.Optional(t.Record(t.String(), t.String())),
});

const modelSchema = t.Object({
  id: t.String(),
  providerId: t.String(),
  displayName: t.String(),
  capabilities: t.Object({
    embedding: t.Optional(t.Literal(true)),
    text: t.Optional(t.Literal(true)),
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
   * (`/task-model-map`).
   */
  response: t.Object({
    config: t.Object({
      providerConnections: t.Record(t.String(), connectionValueSchema),
    }),
    providers: t.Array(providerSchema),
    models: t.Array(modelSchema),
  }),

  /** PUT /model-providers body: partial per-provider connections. */
  putBody: t.Object({
    providerConnections: t.Optional(
      t.Record(t.String(), connectionValueSchema),
    ),
  }),

  /** POST /model-providers/test/embed body: which catalog model to embed with. */
  embedBody: t.Object({
    providerId: t.String(),
    modelId: t.String(),
  }),

  /** POST /model-providers/test/embed response: raw vector from the embedder. */
  embedResponse: t.Object({
    embedding: t.Array(t.Number()),
    modelId: t.String(),
    dim: t.Integer({ minimum: 1 }),
    inputText: t.String(),
  }),

  /** POST /model-providers/test/chat body: which catalog model to chat with. */
  chatBody: t.Object({
    providerId: t.String(),
    modelId: t.String(),
  }),

  /** POST /model-providers/test/chat response. */
  chatResponse: t.Object({
    modelId: t.String(),
    response: t.String(),
  }),
} as const;

export type ModelProvidersModel = {
  [K in keyof typeof ModelProvidersModel]: Static<
    (typeof ModelProvidersModel)[K]
  >;
};
