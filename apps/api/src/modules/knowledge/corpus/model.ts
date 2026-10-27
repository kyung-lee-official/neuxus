import { type Static, t } from "elysia";

const corpusOperationLiteral = t.Union([
  t.Literal("clone"),
  t.Literal("pull"),
  t.Literal("ingest"),
  t.Literal("chunkify"),
  t.Literal("caption"),
]);

const corpusStageLiteral = t.Union([
  t.Literal("clone"),
  t.Literal("fetch"),
  t.Literal("checkout"),
  t.Literal("merge"),
  t.Literal("ingest"),
  t.Literal("chunkify"),
  t.Literal("caption"),
]);

/** Schemas for the corpus operation routes (clone / pull / ingest / chunkify / caption / events). */
export const CorpusModel = {
  corpusAcceptedResponse: t.Object({
    ok: t.Literal(true),
  }),
  corpusIngestResponse: t.Object({
    ok: t.Literal(true),
    pagesProcessed: t.Integer({ minimum: 0 }),
    imagesUpserted: t.Integer({ minimum: 0 }),
    imagesDeleted: t.Integer({ minimum: 0 }),
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
