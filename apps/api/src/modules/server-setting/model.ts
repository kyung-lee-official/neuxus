import { type Static, t } from "elysia";

const logSinkLiteral = t.Union([t.Literal("console"), t.Literal("postgres")]);
const logSinkArray = t.Array(logSinkLiteral);
const logSinkArrayReadonly = t.Readonly(logSinkArray);

const logFields = {
  sinks: logSinkArray,
  queueSize: t.Union([t.Integer({ minimum: 1 }), t.Null()]),
  drainTimeoutMs: t.Union([t.Integer({ minimum: 1 }), t.Null()]),
  pretty: t.Union([t.Boolean(), t.Null()]),
};

const retrieveFields = {
  childLimit: t.Union([t.Integer({ minimum: 1 }), t.Null()]),
  maxParents: t.Union([t.Integer({ minimum: 1 }), t.Null()]),
  maxCharacters: t.Union([t.Integer({ minimum: 1 }), t.Null()]),
};

const corpusFields = {
  repoUrl: t.Union([
    t.String({ examples: ["https://github.com/org/kb.git"] }),
    t.Null(),
  ]),
  branch: t.Union([t.String({ examples: ["main"] }), t.Null()]),
  docsRoot: t.Union([t.String({ examples: ["docs"] }), t.Null()]),
};

const corpusOperationLiteral = t.Union([
  t.Literal("clone"),
  t.Literal("pull"),
  t.Literal("chunkify"),
  t.Literal("embed"),
  t.Literal("sync"),
]);

const corpusStageLiteral = t.Union([
  t.Literal("clone"),
  t.Literal("fetch"),
  t.Literal("checkout"),
  t.Literal("merge"),
  t.Literal("ingest"),
  t.Literal("chunkify"),
  t.Literal("embed"),
]);

/** One persisted per-model connection (`app_model_config.connections`). */
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

export const ServerSettingModel = {
  /** Per-model connection (any value in `connections` map). */
  connection: connectionSchema,

  /** GET /model response: connections + tasks + static catalog. */
  modelResponse: t.Object({
    config: t.Object({
      connections: t.Record(t.String(), connectionSchema),
      tasks: taskPointerSchema,
    }),
    providers: t.Array(providerSchema),
    models: t.Array(modelSchema),
  }),

  /** PUT /model body: connections and/or tasks. Either may be partial. */
  modelBody: t.Object({
    connections: t.Optional(
      t.Record(t.String(), t.Union([connectionSchema, t.Null()])),
    ),
    tasks: t.Optional(taskPointerSchema),
  }),

  /**
   * POST /model/test/:task body — discriminated by `task`. Each task
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

  logBody: t.Object({
    ...logFields,
    sinks: t.Union([logSinkArray, t.Null()]),
  }),
  logResponse: t.Object({
    sinks: logSinkArrayReadonly,
    queueSize: t.Union([t.Integer({ minimum: 1 }), t.Null()]),
    drainTimeoutMs: t.Union([t.Integer({ minimum: 1 }), t.Null()]),
    pretty: t.Union([t.Boolean(), t.Null()]),
    defaults: t.Object({
      sinks: logSinkArrayReadonly,
      queueSize: t.Integer(),
      drainTimeoutMs: t.Integer(),
      pretty: t.Boolean(),
    }),
    availableSinks: logSinkArrayReadonly,
  }),
  logPurgeResponse: t.Object({
    deleted: t.Integer({ minimum: 0, examples: [42] }),
  }),

  retrieveBody: t.Object(retrieveFields),
  retrieveResponse: t.Object({
    ...retrieveFields,
    defaults: t.Object({
      childLimit: t.Integer(),
      maxParents: t.Integer(),
      maxCharacters: t.Integer(),
    }),
  }),

  corpusBody: t.Object(corpusFields),
  corpusResponse: t.Object({
    ...corpusFields,
    lastSyncedSha: t.Union([t.String(), t.Null()]),
  }),
  corpusChunkifyResponse: t.Object({
    ok: t.Literal(true),
    pagesProcessed: t.Integer({ minimum: 0 }),
    pagesSkipped: t.Integer({ minimum: 0 }),
  }),
  corpusEmbedResponse: t.Object({
    ok: t.Literal(true),
    currentModel: t.String(),
    considered: t.Integer({ minimum: 0 }),
    embedded: t.Integer({ minimum: 0 }),
    skipped: t.Integer({ minimum: 0 }),
  }),
  corpusSyncResponse: t.Object({
    ok: t.Literal(true),
  }),
  corpusEvent: t.Object({
    running: t.Boolean(),
    operation: t.Union([corpusOperationLiteral, t.Null()]),
    stage: t.Union([corpusStageLiteral, t.Null()]),
    progress: t.Union([t.Any(), t.Null()]),
    lastError: t.Union([t.String(), t.Null()]),
  }),
  nukeBody: t.Object({
    target: t.Literal("app"),
  }),
  nukeResponse: t.Object({
    ok: t.Literal(true),
    nuked: t.Literal(true),
    target: t.Literal("app"),
  }),
} as const;

export type ServerSettingModel = {
  [K in keyof typeof ServerSettingModel]: Static<
    (typeof ServerSettingModel)[K]
  >;
};
