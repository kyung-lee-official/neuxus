import { status } from "elysia";
import {
  findKnowledgePageById,
  listKnowledgePages,
} from "../../shared/knowledge/index.ts";

function pageIdFromWildcard(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  try {
    const decoded = decodeURIComponent(trimmed).trim();
    return decoded === "" ? null : decoded;
  } catch {
    return null;
  }
}

export abstract class Knowledge {
  static async listPages() {
    const pages = await listKnowledgePages();
    return { pages };
  }

  static async getPage(rawId: string) {
    const id = pageIdFromWildcard(rawId);
    if (!id) throw status(400, { error: "Invalid page id" });
    const page = await findKnowledgePageById(id);
    if (!page) throw status(404, { error: "Page not found" });
    return page;
  }
}
