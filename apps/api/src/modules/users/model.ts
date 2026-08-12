import { type Static, t } from "elysia";

export const UsersModel = {
  createBody: t.Object({
    id: t.String(),
    apiKey: t.Optional(t.String()),
  }),
  updateBody: t.Object({
    apiKey: t.Optional(t.String()),
  }),
  idParams: t.Object({
    id: t.String(),
  }),
  memoryParams: t.Object({
    id: t.String(),
    memoryId: t.String(),
  }),
  dataQuery: t.Object({
    messagePage: t.Optional(t.String()),
  }),
} as const;

export type UsersModel = {
  [K in keyof typeof UsersModel]: Static<(typeof UsersModel)[K]>;
};
