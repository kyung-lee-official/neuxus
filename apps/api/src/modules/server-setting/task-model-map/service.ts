import { loadModelConfig, saveModelConfig } from "./dal.ts";
import type { TaskModelMapModel } from "./model.ts";

export abstract class TaskModelMap {
  /** Read which catalog model is assigned to each app task. */
  static async get(): Promise<TaskModelMapModel["response"]> {
    const config = await loadModelConfig();
    return { tasks: config.tasks };
  }

  /**
   * Update task assignments (partial). A model whose provider is no longer
   * fully configured, or that lacks the task's required capability, is
   * auto-nulled before write.
   */
  static async put(
    body: TaskModelMapModel["putBody"],
  ): Promise<TaskModelMapModel["response"]> {
    const saved = await saveModelConfig({ tasks: body.tasks });
    return { tasks: saved.tasks };
  }
}
