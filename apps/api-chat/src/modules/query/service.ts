import { status } from "elysia";
import { PersonalMemory } from "../personal-data/personal-memory/service.ts";
import { type AppUser } from "../users/service.ts";
import type { QueryModel } from "./model.ts";

export abstract class Query {
  static async remember(user: AppUser, body: QueryModel["rememberBody"]) {
    const content = body.content.trim();
    if (!content) throw status(400, { error: "content is required" });
    const memory = await PersonalMemory.upsert(user.id, content);
    return {
      userId: user.id,
      slug: memory.slug,
      saved: true as const,
    };
  }
}
