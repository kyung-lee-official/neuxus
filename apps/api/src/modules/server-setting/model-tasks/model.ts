import { type Static, t } from "elysia";

const taskAssignmentSchema = t.Union([t.String(), t.Null()]);

const taskPointerSchema = t.Object({
  embedding: taskAssignmentSchema,
  "llm-synthesis": taskAssignmentSchema,
  "md-image-captioning": taskAssignmentSchema,
});

const taskPatchSchema = t.Object({
  embedding: t.Optional(taskAssignmentSchema),
  "llm-synthesis": t.Optional(taskAssignmentSchema),
  "md-image-captioning": t.Optional(taskAssignmentSchema),
});

export const ModelTasksModel = {
  /** GET /model-tasks response: assigned catalog modelId per app task. */
  response: t.Object({
    tasks: taskPointerSchema,
  }),

  /** PUT /model-tasks body: partial assignment patch (null clears a task). */
  putBody: t.Object({
    tasks: t.Optional(taskPatchSchema),
  }),
} as const;

export type ModelTasksModel = {
  [K in keyof typeof ModelTasksModel]: Static<(typeof ModelTasksModel)[K]>;
};
