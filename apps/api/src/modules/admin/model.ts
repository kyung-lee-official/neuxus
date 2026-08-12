import { type Static, t } from "elysia";

export const AdminModel = {
  nukeBody: t.Object({
    target: t.Literal("app"),
  }),
} as const;

export type AdminModel = {
  [K in keyof typeof AdminModel]: Static<(typeof AdminModel)[K]>;
};
