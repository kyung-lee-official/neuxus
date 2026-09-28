/**
 * DAL for `kb_image_descriptions`. One row per
 * `(knowledge_base_id, page_id, image_path)`. Used by the image-description
 * caption pass (see ./pipeline.ts). Read-only knowledge bases only.
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

/** A `vision-captioning` row plus the page's `source_path`, for the caption pass. */
export type CaptionCandidate = {
  pageId: string;
  imagePath: string;
  /** Docs-root-relative source path of the page; null for pages without one. */
  sourcePath: string | null;
  imageContentHash: string;
  captionModel: string | null;
  captionPromptHash: string | null;
  descriptionHash: string | null;
};

/** Rows with `policy = 'vision-captioning'` in one knowledge base. */
export async function listVisionCaptionCandidates(
  knowledgeBaseId: string,
): Promise<CaptionCandidate[]> {
  const rows = await getPrisma().knowledgeImageDescription.findMany({
    where: { knowledgeBaseId, policy: "vision-captioning" },
    select: {
      pageId: true,
      imagePath: true,
      imageContentHash: true,
      captionModel: true,
      captionPromptHash: true,
      descriptionHash: true,
      page: { select: { sourcePath: true } },
    },
    orderBy: [{ pageId: "asc" }, { imagePath: "asc" }],
  });
  return rows.map((row) => ({
    pageId: row.pageId,
    imagePath: row.imagePath,
    sourcePath: row.page.sourcePath,
    imageContentHash: row.imageContentHash,
    captionModel: row.captionModel,
    captionPromptHash: row.captionPromptHash,
    descriptionHash: row.descriptionHash,
  }));
}

export type ImageCaptionFields = {
  imageContentHash: string;
  description: string;
  captionModel: string;
  captionPromptHash: string;
  descriptionHash: string;
};

/** Write a fresh caption and clear the pgvector `embedding` so it re-embeds. */
export async function updateImageCaption(
  knowledgeBaseId: string,
  pageId: string,
  imagePath: string,
  fields: ImageCaptionFields,
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
