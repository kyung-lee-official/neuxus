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
  /** sha256 of the image bytes the caption was built from; null until captioned. */
  imageContentHash: string | null;
  /** `ignore` | `manual` | `vision-captioning`. */
  policy: string;
  description: string | null;
  /** sha256 of `description`; written with the description. */
  descriptionHash: string | null;
  captionModel: string | null;
  hardcodedCaptionPromptHash: string | null;
  /** the `description_hash` the caption pass wrote; compared with `description_hash` to decide re-caption. */
  captionedDescriptionHash: string | null;
  embeddingModel: string | null;
  embeddedAt: Date | null;
  /** sha256 of the `description` this `embedding` was computed from; written by the caption pass. */
  embedInputHash: string | null;
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
 * Rows for one `policy` in a knowledge base. No domain meaning is attached to
 * `policy` here — the argument names the stored value.
 */
export async function listImageDescriptionsByPolicy(
  knowledgeBaseId: string,
  policy: string,
): Promise<ImageDescriptionRow[]> {
  return getPrisma().knowledgeImageDescription.findMany({
    where: { knowledgeBaseId, policy },
    orderBy: [{ pageId: "asc" }, { imagePath: "asc" }],
  });
}

/**
 * Upsert one row by its composite key. The pgvector `embedding` is not written
 * here — the caption pass owns it (raw SQL).
 */
export async function upsertImageDescription(
  row: ImageDescriptionRow,
): Promise<void> {
  const fields = {
    imageContentHash: row.imageContentHash,
    policy: row.policy,
    description: row.description,
    descriptionHash: row.descriptionHash,
    captionModel: row.captionModel,
    hardcodedCaptionPromptHash: row.hardcodedCaptionPromptHash,
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
  /**
   * `description` to write: a string, or `null` to clear it. Omit to leave the
   * stored value untouched (the caption pass owns the vision description).
   */
  description?: string | null;
  /** `description_hash` to write alongside `description`; omit to leave it. */
  descriptionHash?: string | null;
};

/**
 * Upsert one row's `policy` (+ `description` when the caller supplies it) by
 * composite key. Storage only — which fields a policy implies is the caller's
 * concern. `image_content_hash` is owned by the caption pass and is not written
 * here; the pgvector `embedding` is not written here either.
 */
export async function upsertImagePolicy(
  knowledgeBaseId: string,
  pageId: string,
  imagePath: string,
  input: ImagePolicyInput,
): Promise<void> {
  const { policy, description, descriptionHash } = input;
  await getPrisma().knowledgeImageDescription.upsert({
    where: {
      knowledgeBaseId_pageId_imagePath: { knowledgeBaseId, pageId, imagePath },
    },
    create: {
      knowledgeBaseId,
      pageId,
      imagePath,
      policy,
      description: description ?? null,
      descriptionHash: descriptionHash ?? null,
      captionModel: null,
      hardcodedCaptionPromptHash: null,
      captionedDescriptionHash: null,
    },
    update: {
      policy,
      ...(description !== undefined ? { description } : {}),
      ...(descriptionHash !== undefined ? { descriptionHash } : {}),
    },
  });
}

/**
 * Clear the caption inputs (image hash, model, prompt hash) for one row so a
 * later caption pass re-derives. Storage only — the caller decides when. The
 * `embedding` is owned by the caption pass and is left alone.
 */
export async function resetImageDerivedFields(
  knowledgeBaseId: string,
  pageId: string,
  imagePath: string,
): Promise<void> {
  await sql`
    UPDATE kb_image_descriptions
    SET
      image_content_hash = NULL,
      caption_model = NULL,
      hardcoded_caption_prompt_hash = NULL
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

export type ImageDescriptionToEmbed = {
  knowledgeBaseId: string;
  pageId: string;
  imagePath: string;
  /** The description text to embed. */
  text: string;
  /** sha256 of `text` (the row's `description_hash`), stamped as `embed_input_hash` at embed time. */
  descriptionHash: string | null;
};

type ImageDescriptionCandidateRow = {
  knowledge_base_id: string;
  page_id: string;
  image_path: string;
  description: string | null;
  description_hash: string | null;
};

/**
 * Description rows needing a vector: `policy` in `policies` (the caller names
 * them), a `description` present, and either no vector, a stale
 * `embedding_model`, or a description whose hash differs from the one that was
 * embedded. Scope to one knowledge base optionally.
 * @see docs/modern-knowledge-base-design/03.2-image-descriptions.md
 */
export async function findImageDescriptionsNeedingEmbedding(
  currentModel: string,
  policies: string[],
  scope: { knowledgeBaseId?: string } = {},
): Promise<ImageDescriptionToEmbed[]> {
  const kb = scope.knowledgeBaseId ?? null;
  const rows = await sql<ImageDescriptionCandidateRow[]>`
    SELECT knowledge_base_id, page_id, image_path, description, description_hash
    FROM kb_image_descriptions
    WHERE policy = ANY(${sql.array(policies, "text[]")})
      AND description IS NOT NULL
      AND (embedding IS NULL
           OR embedding_model IS DISTINCT FROM ${currentModel}
           OR description_hash IS DISTINCT FROM embed_input_hash)
      AND (${kb}::text IS NULL OR knowledge_base_id = ${kb})
    ORDER BY page_id, image_path
  `;
  return rows.map((row) => ({
    knowledgeBaseId: row.knowledge_base_id,
    pageId: row.page_id,
    imagePath: row.image_path,
    text: row.description ?? "",
    descriptionHash: row.description_hash,
  }));
}

/* * Write one image description's pgvector + model stamp + embedded input hash. */
export async function writeImageDescriptionEmbedding(
  knowledgeBaseId: string,
  pageId: string,
  imagePath: string,
  embeddingLiteral: string,
  model: string,
  descriptionHash: string | null,
): Promise<void> {
  await sql`
    UPDATE kb_image_descriptions
    SET
      embedding = ${embeddingLiteral}::vector,
      embedding_model = ${model},
      embedded_at = NOW(),
      embed_input_hash = ${descriptionHash}
    WHERE knowledge_base_id = ${knowledgeBaseId}
      AND page_id = ${pageId}
      AND image_path = ${imagePath}
  `;
}

export type ImageDescriptionUpdate = {
  imageContentHash: string;
  description: string;
  descriptionHash: string;
  captionModel: string;
  hardcodedCaptionPromptHash: string;
};

/**
 * Write a caption's inputs and text, and stamp `captioned_description_hash` with
 * the `description_hash` just written. The `embedding` is left alone — re-embedding
 * is detected when `description_hash` differs from `embed_input_hash`.
 */
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
      description_hash = ${fields.descriptionHash},
      caption_model = ${fields.captionModel},
      hardcoded_caption_prompt_hash = ${fields.hardcodedCaptionPromptHash},
      captioned_description_hash = ${fields.descriptionHash}
    WHERE knowledge_base_id = ${knowledgeBaseId}
      AND page_id = ${pageId}
      AND image_path = ${imagePath}
  `;
}
