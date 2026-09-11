/**
 * Prisma CRUD for `kb_image_descriptions`. One row per (page_id, image_path).
 * Used by the image-description enricher (see ./pipeline.ts).
 */

import { getPrisma } from "../db.ts";

export type ImageDescRow = {
  pageId: string;
  imagePath: string;
  contentHash: string;
  description: string;
};

export async function upsertImageDescription(row: ImageDescRow): Promise<void> {
  await getPrisma().knowledgeImageDescription.upsert({
    where: {
      pageId_imagePath: {
        pageId: row.pageId,
        imagePath: row.imagePath,
      },
    },
    create: {
      pageId: row.pageId,
      imagePath: row.imagePath,
      contentHash: row.contentHash,
      description: row.description,
    },
    update: {
      contentHash: row.contentHash,
      description: row.description,
    },
  });
}

export async function findImageDescription(
  pageId: string,
  imagePath: string,
): Promise<ImageDescRow | null> {
  const row = await getPrisma().knowledgeImageDescription.findUnique({
    where: {
      pageId_imagePath: {
        pageId,
        imagePath,
      },
    },
  });
  if (!row) return null;
  return {
    pageId: row.pageId,
    imagePath: row.imagePath,
    contentHash: row.contentHash,
    description: row.description,
  };
}
