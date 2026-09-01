import { type Static, t } from "elysia";

const knowledgeChild = t.Object({
  id: t.String(),
  childIndex: t.Integer({ minimum: 0 }),
  text: t.String(),
  startOffset: t.Union([t.Integer(), t.Null()]),
  endOffset: t.Union([t.Integer(), t.Null()]),
  embeddingModel: t.Union([t.String(), t.Null()]),
  embeddedAt: t.Union([t.String(), t.Null()]),
  embedded: t.Boolean(),
});

const knowledgeParent = t.Object({
  id: t.String(),
  parentIndex: t.Integer({ minimum: 0 }),
  text: t.String(),
  startOffset: t.Union([t.Integer(), t.Null()]),
  endOffset: t.Union([t.Integer(), t.Null()]),
  children: t.Array(knowledgeChild),
});

export const KnowledgeModel = {
  pageListResponse: t.Object({
    pages: t.Array(
      t.Object({
        id: t.String(),
        slug: t.String(),
        title: t.String(),
        type: t.Union([t.String(), t.Null()]),
        tags: t.Array(t.String()),
        sourcePath: t.Union([t.String(), t.Null()]),
        contentHash: t.String(),
        updatedAt: t.Union([t.String(), t.Null()]),
        parentCount: t.Integer({ minimum: 0 }),
        childCount: t.Integer({ minimum: 0 }),
      }),
    ),
  }),
  pageDetailResponse: t.Object({
    id: t.String(),
    slug: t.String(),
    title: t.String(),
    type: t.Union([t.String(), t.Null()]),
    tags: t.Array(t.String()),
    body: t.String(),
    sourcePath: t.Union([t.String(), t.Null()]),
    contentHash: t.String(),
    updatedAt: t.Union([t.String(), t.Null()]),
    parents: t.Array(knowledgeParent),
  }),
} as const;

export type KnowledgeModel = {
  [K in keyof typeof KnowledgeModel]: Static<(typeof KnowledgeModel)[K]>;
};
