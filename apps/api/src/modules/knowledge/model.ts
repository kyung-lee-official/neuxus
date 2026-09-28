import { type Static, t } from "elysia";

const knowledgeChild = t.Object({
  id: t.String(),
  childIndex: t.Integer({ minimum: 0 }),
  text: t.String(),
  embeddingModel: t.Union([t.String(), t.Null()]),
  embeddedAt: t.Union([t.String(), t.Null()]),
  embedded: t.Boolean(),
});

const knowledgeParent = t.Object({
  id: t.String(),
  parentIndex: t.Integer({ minimum: 0 }),
  text: t.String(),
  children: t.Array(knowledgeChild),
});

export const KnowledgeModel = {
  pageListResponse: t.Object({
    pages: t.Array(
      t.Object({
        knowledgeBaseId: t.String(),
        id: t.String(),
        title: t.String(),
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
    knowledgeBaseId: t.String(),
    id: t.String(),
    title: t.String(),
    tags: t.Array(t.String()),
    body: t.String(),
    sourcePath: t.Union([t.String(), t.Null()]),
    contentHash: t.String(),
    metaHash: t.Union([t.String(), t.Null()]),
    updatedAt: t.Union([t.String(), t.Null()]),
    parents: t.Array(knowledgeParent),
  }),
} as const;

export type KnowledgeModel = {
  [K in keyof typeof KnowledgeModel]: Static<(typeof KnowledgeModel)[K]>;
};
