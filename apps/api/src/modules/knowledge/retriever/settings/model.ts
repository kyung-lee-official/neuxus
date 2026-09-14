import { type Static, t } from "elysia";

const retrieverFields = {
  childLimit: t.Union([t.Integer({ minimum: 1 }), t.Null()]),
  maxParents: t.Union([t.Integer({ minimum: 1 }), t.Null()]),
  maxCharacters: t.Union([t.Integer({ minimum: 1 }), t.Null()]),
};

/** Schemas for the retriever settings routes (`kb_retrieve_settings` id `default`). */
export const RetrieverSettingsModel = {
  retrieverBody: t.Object(retrieverFields),
  retrieverResponse: t.Object({
    ...retrieverFields,
    defaults: t.Object({
      childLimit: t.Integer(),
      maxParents: t.Integer(),
      maxCharacters: t.Integer(),
    }),
  }),
} as const;

export type RetrieverSettingsModel = {
  [K in keyof typeof RetrieverSettingsModel]: Static<
    (typeof RetrieverSettingsModel)[K]
  >;
};
