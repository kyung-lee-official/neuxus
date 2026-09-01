import { type Static, t } from "elysia";

export const QueryModel = {
  queryBody: t.Object({
    message: t.String({
      minLength: 1,
      examples: ["What is neuxus?"],
    }),
    mode: t.Optional(t.Literal("ask")),
    sessionId: t.Optional(
      t.String({
        examples: ["5f9c3b1a-1234-5678-9abc-def012345678"],
      }),
    ),
  }),
  queryResponse: t.Object({
    userId: t.String({ examples: ["lily"] }),
    sessionId: t.String({
      examples: ["5f9c3b1a-1234-5678-9abc-def012345678"],
    }),
    mode: t.Literal("ask"),
    answer: t.String({ examples: ["neuxus is a personal knowledge base."] }),
  }),
  rememberBody: t.Object({
    content: t.String({
      minLength: 1,
      examples: ["I prefer Korean food over Japanese."],
    }),
  }),
  rememberResponse: t.Object({
    userId: t.String({ examples: ["lily"] }),
    slug: t.String({ examples: ["note-2026-01-15-1"] }),
    saved: t.Literal(true),
  }),
} as const;

export type QueryModel = {
  [K in keyof typeof QueryModel]: Static<(typeof QueryModel)[K]>;
};
