/**
 * Knowledge-base registry. Owns the knowledge-set lifecycle — create, list,
 * read, update, delete — for the root entity every page and search is scoped
 * to. Read-only knowledge bases are corpus-backed; writable ones are maintained
 * through the app.
 */

import { status } from "elysia";
import { isoFromDate } from "../../../shared/serialize.ts";
import {
  createKnowledgeBase,
  deleteKnowledgeBase,
  findKnowledgeBase,
  type KnowledgeBaseRecord,
  listKnowledgeBases,
  updateKnowledgeBase,
} from "./dal.ts";

/** Lowercase slug used as the knowledge-base id. */
const ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

export type KnowledgeBaseView = {
  id: string;
  name: string;
  writable: boolean;
  createdAt: string | null;
};

function toView(row: KnowledgeBaseRecord): KnowledgeBaseView {
  return {
    id: row.id,
    name: row.name,
    writable: row.writable,
    createdAt: isoFromDate(row.createdAt),
  };
}

export abstract class KnowledgeBases {
  /** All knowledge bases, oldest first. */
  static async list(): Promise<KnowledgeBaseView[]> {
    return (await listKnowledgeBases()).map(toView);
  }

  /** One knowledge base, or null when it does not exist. */
  static async get(id: string): Promise<KnowledgeBaseView | null> {
    const row = await findKnowledgeBase(id);
    return row ? toView(row) : null;
  }

  /** Create a knowledge base. 409 when the id already exists. */
  static async create(input: {
    id: string;
    name: string;
    writable?: boolean;
  }): Promise<KnowledgeBaseView> {
    const id = input.id.trim();
    const name = input.name.trim();
    if (!ID_PATTERN.test(id)) {
      throw status(400, { error: "Invalid knowledge base id" });
    }
    if (name === "") {
      throw status(400, { error: "name is required" });
    }
    if (await findKnowledgeBase(id)) {
      throw status(409, { error: "Knowledge base already exists" });
    }
    await createKnowledgeBase({ id, name, writable: input.writable ?? false });
    return (await KnowledgeBases.get(id))!;
  }

  /** Update `name` and/or `writable`. 404 when missing. */
  static async update(
    id: string,
    fields: { name?: string; writable?: boolean },
  ): Promise<KnowledgeBaseView> {
    if (!(await findKnowledgeBase(id))) {
      throw status(404, { error: "Knowledge base not found" });
    }
    const patch: { name?: string; writable?: boolean } = {};
    if (fields.name !== undefined) {
      const name = fields.name.trim();
      if (name === "") {
        throw status(400, { error: "name must not be empty" });
      }
      patch.name = name;
    }
    if (fields.writable !== undefined) patch.writable = fields.writable;
    await updateKnowledgeBase(id, patch);
    return (await KnowledgeBases.get(id))!;
  }

  /** Delete a knowledge base; cascades to its pages, chunks, and settings. */
  static async remove(id: string): Promise<void> {
    if (!(await findKnowledgeBase(id))) {
      throw status(404, { error: "Knowledge base not found" });
    }
    await deleteKnowledgeBase(id);
  }
}
