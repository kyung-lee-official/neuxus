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

export const LogSettingsModel = {
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
} as const;

export type LogSettingsModel = {
  [K in keyof typeof LogSettingsModel]: Static<(typeof LogSettingsModel)[K]>;
};
