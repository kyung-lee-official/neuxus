/**
 * DAL for `kb_image_descriptions`. One row per
 * `(knowledge_base_id, page_id, image_path)`. Read-only knowledge bases only.
 */

import { sql } from "bun";
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

/** An image-description row plus the owning page's `source_path`. */
export type ImageDescriptionWithSource = ImageDescriptionRow & {
  sourcePath: string | null;
};

/**
 * Rows for one `policy` in a knowledge base, each with its page's
 * `source_path` (so a caller can resolve the image file). No domain meaning
 * is attached to `policy` here — the argument names the stored value.
 */
export async function listImageDescriptionsByPolicy(
  knowledgeBaseId: string,
  policy: string,
): Promise<ImageDescriptionWithSource[]> {
  const rows = await getPrisma().knowledgeImageDescription.findMany({
    where: { knowledgeBaseId, policy },
    include: { page: { select: { sourcePath: true } } },
    orderBy: [{ pageId: "asc" }, { imagePath: "asc" }],
  });
  return rows.map(({ page, ...row }) => ({
    ...row,
    sourcePath: page.sourcePath,
  }));
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

export type ImageDescriptionUpdate = {
  imageContentHash: string;
  description: string;
  captionModel: string;
  captionPromptHash: string;
  descriptionHash: string;
};

/** Write new description fields and clear the pgvector `embedding` to re-embed. */
export async function updateImageDescription(
  knowledgeBaseId: string,
  pageId: string,
  imagePath: string,
  fields: ImageDescriptionUpdate,
): Promise<void> {
  await sql`
    UPDATE kb_image_descriptions
    SET
      image_content_hash = ${fields.imageContentHash},
      description = ${fields.description},
      caption_model = ${fields.captionModel},
      caption_prompt_hash = ${fields.captionPromptHash},
      description_hash = ${fields.descriptionHash},
      embedding = NULL
    WHERE knowledge_base_id = ${knowledgeBaseId}
      AND page_id = ${pageId}
      AND image_path = ${imagePath}
  `;
}
