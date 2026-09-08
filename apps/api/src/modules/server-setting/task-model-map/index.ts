import { Elysia } from "elysia";
import { API_TAGS, bearerSecurity } from "../../../shared/openapi.ts";
import { auth } from "../../auth/index.ts";
import { TaskModelMapModel } from "./model.ts";
import { TaskModelMap } from "./service.ts";

const taskModelMapDetail = {
  security: [bearerSecurity],
  tags: [API_TAGS.serverSettingTaskModelMap],
};

/**
 * App task assignment admin: which catalog model serves each app task
 * (`embedding`, `text-synthesis`, `md-image-captioning`). App-level wiring —
 * kept apart from the provider registry (`/model-providers`). Capability
 * tests live at model level under `/model-providers`.
 */
export const taskModelMap = new Elysia({ prefix: "/task-model-map" })
  .use(auth)
  .get("/", () => TaskModelMap.get(), {
    requireAdmin: true,
    response: TaskModelMapModel.response,
    detail: {
      ...taskModelMapDetail,
      summary: "Get app task → model assignments",
      description:
        "Returns which catalog `modelId` is assigned to each app task (`embedding`, `text-synthesis`, `md-image-captioning`), or null when unassigned.",
    },
  })
  .put("/", ({ body }) => TaskModelMap.put(body), {
    requireAdmin: true,
    body: TaskModelMapModel.putBody,
    response: TaskModelMapModel.response,
    detail: {
      ...taskModelMapDetail,
      summary: "Update app task → model assignments",
      description:
        "Partial patch over `tasks`. Set a task to null to clear it. Assignments whose model is unknown, lacks the task's required capability, or whose provider is no longer fully configured are auto-nulled.",
    },
  });
