import { type Static, t } from "elysia";

const retrieverFields = {
  childLimit: t.Union([t.Integer({ minimum: 1 }), t.Null()]),
  maxParents: t.Union([t.Integer({ minimum: 1 }), t.Null()]),
  maxCharacters: t.Union([t.Integer({ minimum: 1 }), t.Null()]),
};

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
