import { type Static, t } from "elysia";

export const NukeModel = {
  nukeBody: t.Object({
    target: t.Literal("app"),
  }),
  nukeResponse: t.Object({
    ok: t.Literal(true),
    nuked: t.Literal(true),
    target: t.Literal("app"),
  }),
} as const;

export type NukeModel = {
  [K in keyof typeof NukeModel]: Static<(typeof NukeModel)[K]>;
};
