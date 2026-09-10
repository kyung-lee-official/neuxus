import { type Static, t } from "elysia";

/** Catalog model `identifier` (or null = unassigned). */
const taskLinkSchema = t.Union([t.String(), t.Null()]);

const taskPointerSchema = t.Object({
  embedding: taskLinkSchema,
  "text-synthesis": taskLinkSchema,
  "md-image-captioning": taskLinkSchema,
});

const taskPatchSchema = t.Object({
  embedding: t.Optional(taskLinkSchema),
  "text-synthesis": t.Optional(taskLinkSchema),
  "md-image-captioning": t.Optional(taskLinkSchema),
});

export const TaskModelMapModel = {
  /** GET /task-model-map response: assigned model `identifier` per app task. */
  response: t.Object({
    tasks: taskPointerSchema,
  }),

  /** PUT /task-model-map body: partial link patch (null clears a task). */
  putBody: t.Object({
    tasks: t.Optional(taskPatchSchema),
  }),
} as const;

export type TaskModelMapModel = {
  [K in keyof typeof TaskModelMapModel]: Static<(typeof TaskModelMapModel)[K]>;
};
