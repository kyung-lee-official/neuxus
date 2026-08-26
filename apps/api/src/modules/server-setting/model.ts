import { type Static, t } from "elysia";

export const ServerSettingModel = {
  embedBody: t.Object({
    embeddingModel: t.Union([t.String(), t.Null()]),
    provider: t.Union([t.String(), t.Null()]),
    host: t.Union([t.String(), t.Null()]),
    port: t.Union([t.Integer({ minimum: 1 }), t.Null()]),
    apiKey: t.Union([t.String(), t.Null()]),
  }),
  nukeBody: t.Object({
    target: t.Literal("app"),
  }),
  synthesisBody: t.Object({
    provider: t.Union([t.String(), t.Null()]),
    synthesisModel: t.Union([t.String(), t.Null()]),
    baseUrl: t.Union([t.String(), t.Null()]),
    apiKey: t.Union([t.String(), t.Null()]),
    maxTokens: t.Union([t.Integer({ minimum: 1 }), t.Null()]),
    contextWindowTokens: t.Union([t.Integer({ minimum: 1 }), t.Null()]),
  }),
  corpusBody: t.Object({
    repoUrl: t.Union([t.String(), t.Null()]),
    branch: t.Union([t.String(), t.Null()]),
    docsRoot: t.Union([t.String(), t.Null()]),
  }),
  logBody: t.Object({
    sinks: t.Union([
      t.Array(t.Union([t.Literal("console"), t.Literal("postgres")])),
      t.Null(),
    ]),
    queueSize: t.Union([t.Integer({ minimum: 1 }), t.Null()]),
    drainTimeoutMs: t.Union([t.Integer({ minimum: 1 }), t.Null()]),
    pretty: t.Union([t.Boolean(), t.Null()]),
  }),
} as const;

export type ServerSettingModel = {
  [K in keyof typeof ServerSettingModel]: Static<
    (typeof ServerSettingModel)[K]
  >;
};
