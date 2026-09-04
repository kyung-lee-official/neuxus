import { type Static, t } from "elysia";

/** One persisted per-provider connection (`app_model_config.providerConnections`). */
const connectionSchema = t.Object({
  apiKey: t.Union([t.String(), t.Null()]),
  baseUrl: t.Union([t.String(), t.Null()]),
  port: t.Union([t.Integer({ minimum: 1, maximum: 65535 }), t.Null()]),
});

const capabilityLiteral = t.Union([
  t.Literal("embedding"),
  t.Literal("llm"),
  t.Literal("vision"),
]);

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

const taskPointerSchema = t.Object({
  embedding: t.Union([t.String(), t.Null()]),
  llm: t.Union([t.String(), t.Null()]),
  vision: t.Union([t.String(), t.Null()]),
});

export const ModelProvidersModel = {
  /** GET /model-providers response: providerConnections + tasks + static catalog. */
  modelResponse: t.Object({
    config: t.Object({
      providerConnections: t.Record(t.String(), connectionSchema),
      tasks: taskPointerSchema,
    }),
    providers: t.Array(providerSchema),
    models: t.Array(modelSchema),
  }),

  /** PUT /model-providers body: providerConnections and/or tasks. Either may be partial. */
  modelBody: t.Object({
    providerConnections: t.Optional(
      t.Record(t.String(), t.Union([connectionSchema, t.Null()])),
    ),
    tasks: t.Optional(taskPointerSchema),
  }),

  /**
   * POST /model-providers/test/:task body — discriminated by `task`. Each task
   * carries only the fields it needs; the others may be absent.
   */
  modelTestBody: t.Object({
    task: capabilityLiteral,
    /** embedding */
    query: t.Optional(t.String()),
    limit: t.Optional(t.Integer({ minimum: 1, maximum: 50 })),
    /** llm */
    prompt: t.Optional(t.String()),
    /** vision (image as base64, no `data:` prefix) */
    imageBase64: t.Optional(t.String()),
    mimeType: t.Optional(t.String()),
    name: t.Optional(t.String()),
  }),

  /** POST /model-providers/test/embed body: which catalog model to embed with. */
  testEmbedBody: t.Object({
    modelId: t.String(),
  }),

  /** POST /model/test/embed response: raw vector from the embedder. */
  testEmbedResponse: t.Object({
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
