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
} as const;

export type ServerSettingModel = {
  [K in keyof typeof ServerSettingModel]: Static<
    (typeof ServerSettingModel)[K]
  >;
};
