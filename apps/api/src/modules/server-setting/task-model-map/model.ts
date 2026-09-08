import { type Static, t } from "elysia";

const taskAssignmentSchema = t.Union([t.String(), t.Null()]);

const taskPointerSchema = t.Object({
  embedding: taskAssignmentSchema,
  "text-synthesis": taskAssignmentSchema,
  "md-image-captioning": taskAssignmentSchema,
});

const taskPatchSchema = t.Object({
  embedding: t.Optional(taskAssignmentSchema),
  "text-synthesis": t.Optional(taskAssignmentSchema),
  "md-image-captioning": t.Optional(taskAssignmentSchema),
});

export const TaskModelMapModel = {
  /** GET /task-model-map response: assigned catalog modelId per app task. */
  response: t.Object({
    tasks: taskPointerSchema,
  }),

  /** PUT /task-model-map body: partial assignment patch (null clears a task). */
  putBody: t.Object({
    tasks: t.Optional(taskPatchSchema),
  }),
} as const;

export type TaskModelMapModel = {
  [K in keyof typeof TaskModelMapModel]: Static<(typeof TaskModelMapModel)[K]>;
};
