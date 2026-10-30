import { type Static, t } from "elysia";

export const AgentSettingsModel = {
  updateBody: t.Object({
    deepseekApiKey: t.Optional(t.Union([t.String(), t.Null()])),
    maxToolIterations: t.Optional(
      t.Union([t.Integer({ minimum: 1 }), t.Null()]),
    ),
    streamTimeoutMs: t.Optional(t.Union([t.Integer({ minimum: 1 }), t.Null()])),
    runMaxAttempts: t.Optional(t.Union([t.Integer({ minimum: 1 }), t.Null()])),
  }),
  response: t.Object({
    hasDeepseekApiKey: t.Boolean(),
    maxToolIterations: t.Integer(),
    streamTimeoutMs: t.Integer(),
    runMaxAttempts: t.Integer(),
    defaults: t.Object({
      maxToolIterations: t.Integer(),
      streamTimeoutMs: t.Integer(),
      runMaxAttempts: t.Integer(),
    }),
  }),
} as const;

export type AgentSettingsModel = {
  [K in keyof typeof AgentSettingsModel]: Static<
    (typeof AgentSettingsModel)[K]
  >;
};
