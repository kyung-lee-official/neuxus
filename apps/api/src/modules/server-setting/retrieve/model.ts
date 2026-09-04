import { type Static, t } from "elysia";

const retrieveFields = {
  childLimit: t.Union([t.Integer({ minimum: 1 }), t.Null()]),
  maxParents: t.Union([t.Integer({ minimum: 1 }), t.Null()]),
  maxCharacters: t.Union([t.Integer({ minimum: 1 }), t.Null()]),
};

export const RetrieveSettingsModel = {
  retrieveBody: t.Object(retrieveFields),
  retrieveResponse: t.Object({
    ...retrieveFields,
    defaults: t.Object({
      childLimit: t.Integer(),
      maxParents: t.Integer(),
      maxCharacters: t.Integer(),
    }),
  }),
} as const;

export type RetrieveSettingsModel = {
  [K in keyof typeof RetrieveSettingsModel]: Static<
    (typeof RetrieveSettingsModel)[K]
  >;
};
