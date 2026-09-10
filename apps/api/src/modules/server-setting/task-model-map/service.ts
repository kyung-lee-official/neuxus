import { status } from "elysia";
import { loadAssignments, saveAssignments } from "./dal.ts";
import type { TaskModelMapModel } from "./model.ts";

export abstract class TaskModelMap {
  /** Read which catalog model is assigned to each app task. */
  static async get(): Promise<TaskModelMapModel["response"]> {
    return { tasks: await loadAssignments() };
  }

  /**
   * Update task assignment links. Every supplied task key must be known and
   * every value a catalog model identifier that can serve the task.
   */
  static async put(
    body: TaskModelMapModel["putBody"],
  ): Promise<TaskModelMapModel["response"]> {
    if (!body.tasks) {
      throw status(400, { error: "tasks is required" });
    }
    const tasks = await saveAssignments(body.tasks as Record<string, unknown>);
    return { tasks };
  }
}
