import { status } from "elysia";
import { loadLinks, saveLinks } from "./dal.ts";
import type { TaskModelMapModel } from "./model.ts";

export abstract class TaskModelMap {
  /** Read which catalog model is assigned to each app task. */
  static async get(): Promise<TaskModelMapModel["response"]> {
    return { tasks: await loadLinks() };
  }

  /**
   * Update task link links. Every supplied task key must be known and
   * every value a catalog model identifier that can serve the task.
   */
  static async put(
    body: TaskModelMapModel["putBody"],
  ): Promise<TaskModelMapModel["response"]> {
    if (!body.tasks) {
      throw status(400, { error: "tasks is required" });
    }
    const tasks = await saveLinks(body.tasks as Record<string, unknown>);
    return { tasks };
  }
}
