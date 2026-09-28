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

export type ImagePolicyInput = {
  /** Stored value; this layer attaches no meaning to it. */
  policy: string;
  imageContentHash: string;
  /**
   * `description` to write: a string, or `null` to clear it. Omit to leave the
   * stored value untouched (the embed/caption passes own those fields).
   */
  description?: string | null;
};

/**
 * Upsert one row's `policy` + `image_content_hash` (+ `description` when the
 * caller supplies it) by composite key. Storage only — which fields a policy
 * implies is the caller's concern. The pgvector `embedding` is not written
 * here.
 */
export async function upsertImagePolicy(
  knowledgeBaseId: string,
  pageId: string,
  imagePath: string,
  input: ImagePolicyInput,
): Promise<void> {
  const { policy, imageContentHash, description } = input;
  await getPrisma().knowledgeImageDescription.upsert({
    where: {
      knowledgeBaseId_pageId_imagePath: { knowledgeBaseId, pageId, imagePath },
    },
    create: {
      knowledgeBaseId,
      pageId,
      imagePath,
      policy,
      imageContentHash,
      description: description ?? null,
      captionModel: null,
      captionPromptHash: null,
      descriptionHash: null,
    },
    update: {
      policy,
      imageContentHash,
      ...(description !== undefined ? { description } : {}),
    },
  });
}

/**
 * Null the derived caption fields and the pgvector `embedding` for one row so
 * they re-derive. Storage only — the caller decides when.
 */
export async function resetImageDerivedFields(
  knowledgeBaseId: string,
  pageId: string,
  imagePath: string,
): Promise<void> {
  await sql`
    UPDATE kb_image_descriptions
    SET
      caption_model = NULL,
      caption_prompt_hash = NULL,
      description_hash = NULL,
      embedding = NULL
    WHERE knowledge_base_id = ${knowledgeBaseId}
      AND page_id = ${pageId}
      AND image_path = ${imagePath}
  `;
}

/** Delete rows for one page whose `image_path` is not in `imagePaths`. */
export async function deleteImageDescriptionsNotIn(
  knowledgeBaseId: string,
  pageId: string,
  imagePaths: string[],
): Promise<number> {
  const { count } = await getPrisma().knowledgeImageDescription.deleteMany({
    where: { knowledgeBaseId, pageId, imagePath: { notIn: imagePaths } },
  });
  return count;
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
