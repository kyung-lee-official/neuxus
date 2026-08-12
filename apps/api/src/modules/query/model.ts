import { type Static, t } from "elysia";

export const QueryModel = {
  queryBody: t.Object({
    message: t.String({ minLength: 1 }),
    mode: t.Optional(t.Literal("ask")),
    sessionId: t.Optional(t.String()),
  }),
  rememberBody: t.Object({
    content: t.String({ minLength: 1 }),
  }),
} as const;

export type QueryModel = {
  [K in keyof typeof QueryModel]: Static<(typeof QueryModel)[K]>;
};
