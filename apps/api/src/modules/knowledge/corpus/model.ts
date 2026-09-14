import { type Static, t } from "elysia";

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

/** Schemas for the corpus operation routes (clone / pull / chunkify / embed / sync / events). */
export const CorpusModel = {
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
} as const;

export type CorpusModel = {
  [K in keyof typeof CorpusModel]: Static<(typeof CorpusModel)[K]>;
};
