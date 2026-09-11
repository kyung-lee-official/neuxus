/**
 * Personal-memory domain. This is the module's public API — other modules
 * import `PersonalMemory` from here, never from `dal.ts`.
 */

import {
  type AppMemory,
  deleteMemoryByUser,
  listMemoriesByUser,
  searchMemoriesByUserFTS,
  upsertMemory,
} from "./dal.ts";

export type { AppMemory } from "./dal.ts";

const SEARCH_LIMIT = 8;

export abstract class PersonalMemory {
  /** Upsert a note by `(userId, slug)`. */
  static upsert(
    userId: string,
    slug: string,
    content: string,
  ): Promise<AppMemory> {
    return upsertMemory(userId, slug, content);
  }

  /** All of a user's memories, newest first. */
  static listByUser(userId: string, limit?: number): Promise<AppMemory[]> {
    return listMemoriesByUser(userId, limit);
  }

  /** Delete one memory owned by `userId`; `false` when missing. */
  static deleteByUser(userId: string, memoryId: number): Promise<boolean> {
    return deleteMemoryByUser(userId, memoryId);
  }

  /**
   * Search a user's memories for content related to the question.
   * Strategy: try Postgres FTS first; if no question or no hits, fall back to
   * the user's most recent memories (still in scope).
   */
  static async search(
    userId: string,
    question?: string,
    limit = SEARCH_LIMIT,
  ): Promise<AppMemory[]> {
    const trimmed = question?.trim() ?? "";
    if (trimmed) {
      const matched = await searchMemoriesByUserFTS(userId, trimmed, limit);
      if (matched.length > 0) return matched;
    }
    return listMemoriesByUser(userId, limit);
  }

  /** Slug for a fresh memory note, e.g. `memory/note-1726000000000`. */
  static slugForNote(now = new Date()): string {
    return `memory/note-${now.getTime()}`;
  }
}
