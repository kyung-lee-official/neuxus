import { type Static, t } from "elysia";

export const SessionsModel = {
  sessionParams: t.Object({
    sessionId: t.String({ minLength: 1 }),
  }),
  patchBody: t.Object({
    title: t.Union([t.String(), t.Null()]),
  }),
} as const;

export type SessionsModel = {
  [K in keyof typeof SessionsModel]: Static<(typeof SessionsModel)[K]>;
};
