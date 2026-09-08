import {
  loadModelConfig,
  saveModelConfig,
} from "../../../shared/model-tasks/index.ts";
import type { ModelTasksModel } from "./model.ts";

export abstract class ModelTasks {
  /** Read which catalog model is assigned to each app task. */
  static async get(): Promise<ModelTasksModel["response"]> {
    const config = await loadModelConfig();
    return { tasks: config.tasks };
  }

  /**
   * Update task assignments (partial). A model whose provider is no longer
   * fully configured, or that lacks the task's required capability, is
   * auto-nulled before write.
   */
  static async put(
    body: ModelTasksModel["putBody"],
  ): Promise<ModelTasksModel["response"]> {
    const saved = await saveModelConfig({ tasks: body.tasks });
    return { tasks: saved.tasks };
  }
}
