import { status } from "elysia";
import { nukeDatabases } from "../../shared/db.ts";
import type { AdminModel } from "./model.ts";

export abstract class Admin {
  static async nuke(body: AdminModel["nukeBody"]) {
    try {
      await nukeDatabases(body.target);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw status(500, { error: msg });
    }
    return { ok: true as const, nuked: true as const, target: body.target };
  }
}
