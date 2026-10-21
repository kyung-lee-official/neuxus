import { status } from "elysia";
import {
  ImageDescriptions,
  type KnowledgeImageListItem,
} from "./image-desc/index.ts";
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

  static async listImages(
    knowledgeBaseId: string,
    filters?: { pageId?: string; policy?: string },
  ): Promise<{ images: KnowledgeImageListItem[] }> {
    return { images: await ImageDescriptions.list(knowledgeBaseId, filters) };
  }
}
