/**
 * DAL for `kb_image_descriptions`. One row per
 * `(knowledge_base_id, page_id, image_path)`. Used by the image-description
 * enricher and caption pass (see ./pipeline.ts). Read-only knowledge bases only.
 */

import { getPrisma } from "../../../shared/db.ts";

export type ImageDescriptionRow = {
  knowledgeBaseId: string;
  pageId: string;
  imagePath: string;
  /** sha256 hex of the image bytes. */
  imageContentHash: string;
  /** `ignore` | `manual` | `vision-captioning`. */
  policy: string;
  description: string | null;
  captionModel: string | null;
  captionPromptHash: string | null;
  descriptionHash: string | null;
  embeddingModel: string | null;
  embeddedAt: Date | null;
};

/** One image-description row by its composite key, or null. */
export async function findImageDescription(
  knowledgeBaseId: string,
  pageId: string,
  imagePath: string,
): Promise<ImageDescriptionRow | null> {
  return getPrisma().knowledgeImageDescription.findUnique({
    where: {
      knowledgeBaseId_pageId_imagePath: { knowledgeBaseId, pageId, imagePath },
    },
  });
}

/** All image-description rows for one page, ordered by `image_path`. */
export async function listImageDescriptionsByPage(
  knowledgeBaseId: string,
  pageId: string,
): Promise<ImageDescriptionRow[]> {
  return getPrisma().knowledgeImageDescription.findMany({
    where: { knowledgeBaseId, pageId },
    orderBy: { imagePath: "asc" },
  });
}

/**
 * Upsert one row by its composite key. The pgvector `embedding` is not written
 * here — the embed pass owns it (raw SQL).
 */
export async function upsertImageDescription(
  row: ImageDescriptionRow,
): Promise<void> {
  const fields = {
    imageContentHash: row.imageContentHash,
    policy: row.policy,
    description: row.description,
    captionModel: row.captionModel,
    captionPromptHash: row.captionPromptHash,
    descriptionHash: row.descriptionHash,
  };
  await getPrisma().knowledgeImageDescription.upsert({
    where: {
      knowledgeBaseId_pageId_imagePath: {
        knowledgeBaseId: row.knowledgeBaseId,
        pageId: row.pageId,
        imagePath: row.imagePath,
      },
    },
    create: {
      knowledgeBaseId: row.knowledgeBaseId,
      pageId: row.pageId,
      imagePath: row.imagePath,
      ...fields,
    },
    update: fields,
  });
}
