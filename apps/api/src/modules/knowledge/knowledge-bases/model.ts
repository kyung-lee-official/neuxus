import { type Static, t } from "elysia";

const knowledgeBase = t.Object({
  id: t.String(),
  name: t.String(),
  writable: t.Boolean(),
  createdAt: t.Union([t.String(), t.Null()]),
});

/** Schemas for the knowledge-base registry routes (`kb_knowledge_bases`). */
export const KnowledgeBasesModel = {
  createBody: t.Object({
    id: t.String({ examples: ["docs"] }),
    name: t.String({ examples: ["Product docs"] }),
    writable: t.Optional(t.Boolean()),
  }),
  updateBody: t.Object({
    name: t.Optional(t.String()),
  }),
  listResponse: t.Object({ knowledgeBases: t.Array(knowledgeBase) }),
  knowledgeBaseResponse: knowledgeBase,
  deletedResponse: t.Object({ deleted: t.Boolean(), id: t.String() }),
} as const;

export type KnowledgeBasesModel = {
  [K in keyof typeof KnowledgeBasesModel]: Static<
    (typeof KnowledgeBasesModel)[K]
  >;
};
