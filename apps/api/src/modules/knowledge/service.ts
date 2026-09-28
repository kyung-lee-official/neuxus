import { status } from "elysia";
import { Page } from "./pages/index.ts";

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
  static async listPages(knowledgeBaseId: string) {
    const pages = await Page.list(knowledgeBaseId);
    return { pages };
  }

  static async getPage(knowledgeBaseId: string, rawId: string) {
    const id = pageIdFromWildcard(rawId);
    if (!id) throw status(400, { error: "Invalid page id" });
    const page = await Page.findById(knowledgeBaseId, id);
    if (!page) throw status(404, { error: "Page not found" });
    return page;
  }
}
