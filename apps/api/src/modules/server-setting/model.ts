import { type Static, t } from "elysia";

const embedFields = {
  embeddingModel: t.Union([t.String(), t.Null()]),
  provider: t.Union([t.String(), t.Null()]),
  host: t.Union([t.String(), t.Null()]),
  port: t.Union([t.Integer({ minimum: 1 }), t.Null()]),
  apiKey: t.Union([t.String(), t.Null()]),
};

const embedDefaults = {
  embeddingModel: t.String(),
  provider: t.String(),
  host: t.String(),
  port: t.Integer(),
  apiKey: t.Union([t.String(), t.Null()]),
};

const synthesisFields = {
  provider: t.Union([t.String(), t.Null()]),
  synthesisModel: t.Union([t.String(), t.Null()]),
  baseUrl: t.Union([t.String(), t.Null()]),
  apiKey: t.Union([t.String(), t.Null()]),
  maxTokens: t.Union([t.Integer({ minimum: 1 }), t.Null()]),
  contextWindowTokens: t.Union([t.Integer({ minimum: 1 }), t.Null()]),
};

const synthesisDefaults = {
  provider: t.String(),
  synthesisModel: t.String(),
  baseUrl: t.String(),
  apiKey: t.Union([t.String(), t.Null()]),
  maxTokens: t.Integer(),
  contextWindowTokens: t.Integer(),
};

const logSinkLiteral = t.Union([t.Literal("console"), t.Literal("postgres")]);
const logSinkArray = t.Array(logSinkLiteral);
const logSinkArrayReadonly = t.Readonly(logSinkArray);

const logFields = {
  sinks: logSinkArray,
  queueSize: t.Union([t.Integer({ minimum: 1 }), t.Null()]),
  drainTimeoutMs: t.Union([t.Integer({ minimum: 1 }), t.Null()]),
  pretty: t.Union([t.Boolean(), t.Null()]),
};

const logDefaults = {
  sinks: logSinkArray,
  queueSize: t.Integer(),
  drainTimeoutMs: t.Integer(),
  pretty: t.Boolean(),
};

const retrieveFields = {
  childLimit: t.Union([t.Integer({ minimum: 1 }), t.Null()]),
  maxParents: t.Union([t.Integer({ minimum: 1 }), t.Null()]),
  maxCharacters: t.Union([t.Integer({ minimum: 1 }), t.Null()]),
};

const retrieveDefaults = {
  childLimit: t.Integer(),
  maxParents: t.Integer(),
  maxCharacters: t.Integer(),
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

export const ServerSettingModel = {
  embedBody: t.Object(embedFields),
  embedResponse: t.Object({
    ...embedFields,
    defaults: t.Object(embedDefaults),
  }),
  synthesisBody: t.Object(synthesisFields),
  synthesisResponse: t.Object({
    ...synthesisFields,
    defaults: t.Object(synthesisDefaults),
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
    defaults: t.Object(retrieveDefaults),
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
  embedTestSearchBody: t.Object({
    query: t.String({ minLength: 1 }),
    limit: t.Optional(t.Integer({ minimum: 1, maximum: 50 })),
  }),
  embedTestSearchResponse: t.Object({
    results: t.Array(
      t.Object({
        id: t.String(),
        slug: t.String(),
        title: t.String(),
        type: t.Union([t.String(), t.Null()]),
        tags: t.Array(t.String()),
        sourcePath: t.Union([t.String(), t.Null()]),
        contentHash: t.String(),
        updatedAt: t.Union([t.String(), t.Null()]),
        parentCount: t.Integer({ minimum: 0 }),
        childCount: t.Integer({ minimum: 0 }),
        /** Cosine similarity in [0, 1]; 1 - distance. */
        score: t.Number({ minimum: 0, maximum: 1 }),
      }),
    ),
  }),
  imageTestBody: t.Object({
    image: t.File(),
  }),
  imageTestResponse: t.Object({
    description: t.String(),
    mimeType: t.String(),
    sizeBytes: t.Integer({ minimum: 0 }),
    name: t.String(),
  }),
} as const;

export type ServerSettingModel = {
  [K in keyof typeof ServerSettingModel]: Static<
    (typeof ServerSettingModel)[K]
  >;
};
