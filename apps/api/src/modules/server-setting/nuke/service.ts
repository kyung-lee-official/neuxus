import { status } from "elysia";
import { nukeDatabases } from "../../../shared/db.ts";
import type { NukeModel } from "./model.ts";

export abstract class Nuke {
  static async wipe(
    body: NukeModel["nukeBody"],
  ): Promise<NukeModel["nukeResponse"]> {
    try {
      await nukeDatabases(body.target);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw status(500, { error: msg });
    }
    return { ok: true as const, nuked: true as const, target: body.target };
  }
}
