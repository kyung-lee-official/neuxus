import { Elysia } from "elysia";
import { API_TAGS, bearerSecurity } from "../../../shared/openapi.ts";
import { auth } from "../../auth/index.ts";
import { ModelTasksModel } from "./model.ts";
import { ModelTasks } from "./service.ts";

const modelTasksDetail = {
  security: [bearerSecurity],
  tags: [API_TAGS.serverSettingModelTasks],
};

/**
 * App task assignment admin: which catalog model serves each app task
 * (`embedding`, `llm-synthesis`, `md-image-captioning`). App-level wiring —
 * kept apart from the provider registry (`/model-providers`). Capability
 * tests live at model level under `/model-providers`.
 */
export const modelTasks = new Elysia({ prefix: "/model-tasks" })
  .use(auth)
  .get("/", () => ModelTasks.get(), {
    requireAdmin: true,
    response: ModelTasksModel.response,
    detail: {
      ...modelTasksDetail,
      summary: "Get app task → model assignments",
      description:
        "Returns which catalog `modelId` is assigned to each app task (`embedding`, `llm-synthesis`, `md-image-captioning`), or null when unassigned.",
    },
  })
  .put("/", ({ body }) => ModelTasks.put(body), {
    requireAdmin: true,
    body: ModelTasksModel.putBody,
    response: ModelTasksModel.response,
    detail: {
      ...modelTasksDetail,
      summary: "Update app task → model assignments",
      description:
        "Partial patch over `tasks`. Set a task to null to clear it. Assignments whose model is unknown, lacks the task's required capability, or whose provider is no longer fully configured are auto-nulled.",
    },
  });
