import { type Static, t } from "elysia";

/** Schemas for the log module's root routes (currently the `app_log` purge). */
export const LogModel = {
  logPurgeResponse: t.Object({
    deleted: t.Integer({ minimum: 0, examples: [42] }),
  }),
} as const;

export type LogModel = {
  [K in keyof typeof LogModel]: Static<(typeof LogModel)[K]>;
};
