import { type Static, t } from "elysia";

/** A provider connection payload is provider-specific; validated per provider in core. */
const connectionValueSchema = t.Any();

const modelSchema = t.Object({
  identifier: t.String(),
  modelId: t.String(),
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

const providerSchema = t.Object({
  id: t.String(),
  displayName: t.String(),
  baseUrl: t.Optional(t.String({ format: "uri" })),
  headers: t.Optional(t.Record(t.String(), t.String())),
  models: t.Array(modelSchema),
});

const providerIdParams = t.Object({
  providerId: t.String(),
});

export const ModelProvidersModel = {
  /** GET /model-providers/providers: the static catalog, providers with nested models. */
  providersResponse: t.Object({
    providers: t.Array(providerSchema),
  }),

  /** GET/PUT .../providers/:providerId/connection response. */
  connectionResponse: t.Object({
    providerId: t.String(),
    connection: connectionValueSchema,
  }),

  /** PUT .../providers/:providerId/connection body. */
  connectionBody: t.Object({
    connection: connectionValueSchema,
  }),

  /** DELETE .../providers/:providerId/connection response. */
  deleteResponse: t.Object({
    providerId: t.String(),
    deleted: t.Literal(true),
  }),

  /** POST .../providers/:providerId/test/embed body. */
  embedTestBody: t.Object({
    modelId: t.String(),
  }),

  /** POST .../providers/:providerId/test/embed response. */
  embedTestResponse: t.Object({
    embedding: t.Array(t.Number()),
    modelId: t.String(),
    dim: t.Integer({ minimum: 1 }),
    inputText: t.String(),
  }),

  /** POST .../providers/:providerId/test/chat body. */
  chatTestBody: t.Object({
    modelId: t.String(),
    prompt: t.String(),
  }),

  /** POST .../providers/:providerId/test/image body. */
  imageTestBody: t.Object({
    modelId: t.String(),
    prompt: t.String(),
    image: t.Object({
      mimeType: t.String(),
      /** Base64 image bytes (no `data:` prefix). */
      data: t.String(),
    }),
  }),

  /** POST .../providers/:providerId/test/{chat,image} response. */
  textTestResponse: t.Object({
    modelId: t.String(),
    response: t.String(),
  }),
} as const;

export type ModelProvidersModel = {
  [K in keyof typeof ModelProvidersModel]: Static<
    (typeof ModelProvidersModel)[K]
  >;
};

export { providerIdParams };
