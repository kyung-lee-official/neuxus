/**
 * Image-description passes: the caption pass (`ImageCaptioner`) and the
 * description embedding pass (`ImageDescriptionEmbedder`). Both read/write
 * `kb_image_descriptions` only; neither touches `kb_pages.body`.
 *
 * @see docs/modern-knowledge-base-design/03.2-image-descriptions.md
 */

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";

import {
  resolveTaskModelLink,
  TASK_MD_IMAGE_CAPTIONING,
} from "../../server-setting/task-model-map/service.ts";
import { Embedder, type EmbedFn } from "../embedder/index.ts";
import {
  findImageDescriptionsNeedingEmbedding,
  listImageDescriptionsByPolicy,
  updateImageDescription,
  writeImageDescriptionEmbedding,
} from "./dal.ts";
import { DESCRIBED_IMAGE_POLICIES } from "./image-meta.ts";

/**
 * Business prompt for the `md-image-captioning` task. Its `sha256` is stored
 * as `hardcoded_caption_prompt_hash`; editing this text re-captions stored rows.
 */
const CAPTION_PROMPT =
  "Describe this image in one concise paragraph. Focus on the technical content: what is shown, the meaning of any labels or values, and any diagram relationships. Do not start with phrases like 'This image shows' — start directly with the subject. Do not repeat information that is already described in nearby text. Output only the description, no preamble.";

/** A captioning client: image bytes in, one-line description out. */
export type ImageDescriber = {
  describe(image: {
    absolutePath: string;
    bytes: Buffer;
    mimeType: string;
  }): Promise<string>;
};

const MIME_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

function mimeTypeFor(imageAbsPath: string): string {
  return (
    MIME_BY_EXT[extname(imageAbsPath).toLowerCase()] ??
    "application/octet-stream"
  );
}

function sha256Hex(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export type CaptionPassOptions = {
  knowledgeBaseId: string;
  /** Local corpus checkout root (the knowledge base's working tree). */
  checkoutDir: string;
  /** Docs root within the checkout (POSIX; `""` walks the checkout root). */
  docsRoot: string;
  describer?: ImageDescriber;
  /** Throw on the first failure instead of skipping the image. */
  failFast?: boolean;
};

export type CaptionPassResult = {
  currentModel: string;
  considered: number;
  captioned: number;
  skipped: number;
  failed: number;
};

export class ImageCaptioner {
  /** Caption every stale `vision-captioning` image in one knowledge base. */
  static async captionStale(
    options: CaptionPassOptions,
  ): Promise<CaptionPassResult> {
    const link = await resolveTaskModelLink(TASK_MD_IMAGE_CAPTIONING);
    if (!link) {
      throw new Error("No model is linked to the md-image-captioning task");
    }
    const currentModel = link.model.identifier;
    const currentPromptHash = sha256Hex(Buffer.from(CAPTION_PROMPT, "utf8"));
    const describer: ImageDescriber = options.describer ?? {
      describe: ({ bytes, mimeType }) =>
        link.provider.imageChat(link.model.modelId, CAPTION_PROMPT, {
          bytes,
          mimeType,
        }),
    };

    const candidates = await listImageDescriptionsByPolicy(
      options.knowledgeBaseId,
      "vision-captioning",
    );

    let captioned = 0;
    let skipped = 0;
    let failed = 0;

    for (const candidate of candidates) {
      try {
        const imageAbsPath = join(
          options.checkoutDir,
          options.docsRoot,
          candidate.imagePath,
        );
        const bytes = await readFile(imageAbsPath);
        const imageContentHash = sha256Hex(bytes);

        const fresh =
          imageContentHash === candidate.imageContentHash &&
          candidate.captionModel === currentModel &&
          candidate.hardcodedCaptionPromptHash === currentPromptHash &&
          candidate.description != null;
        if (fresh) {
          skipped += 1;
          continue;
        }

        const description = (
          await describer.describe({
            absolutePath: imageAbsPath,
            bytes,
            mimeType: mimeTypeFor(imageAbsPath),
          })
        )
          .replace(/\s+/g, " ")
          .trim();

        await updateImageDescription(
          options.knowledgeBaseId,
          candidate.pageId,
          candidate.imagePath,
          {
            imageContentHash,
            description,
            captionModel: currentModel,
            hardcodedCaptionPromptHash: currentPromptHash,
          },
        );
        captioned += 1;
      } catch (err) {
        if (options.failFast) throw err;
        failed += 1;
      }
    }

    return {
      currentModel,
      considered: candidates.length,
      captioned,
      skipped,
      failed,
    };
  }
}

/**
 * Policies whose descriptions carry a vector. `ignore` rows are excluded.
 * @see docs/modern-knowledge-base-design/03.2-image-descriptions.md
 */
export type EmbedImageDescriptionsOptions = {
  /** Scope to one knowledge base; omit to scan all. */
  knowledgeBaseId?: string;
  embedder?: EmbedFn;
  /** Throw on the first provider failure instead of skipping the row. */
  failFast?: boolean;
};

export type EmbedImageDescriptionsResult = {
  currentModel: string;
  considered: number;
  embedded: number;
  skipped: number;
};

export class ImageDescriptionEmbedder {
  /**
   * Embed `manual` / `vision-captioning` descriptions whose `embedding` is
   * missing or whose `embedding_model` differs from the current model.
   */
  static async embedStale(
    options?: EmbedImageDescriptionsOptions,
  ): Promise<EmbedImageDescriptionsResult> {
    const { currentModel, embed } = await Embedder.resolve(options?.embedder);

    const rows = await findImageDescriptionsNeedingEmbedding(
      currentModel,
      [...DESCRIBED_IMAGE_POLICIES],
      { knowledgeBaseId: options?.knowledgeBaseId },
    );

    const result = await Embedder.embedRows(rows, {
      embedder: embed,
      failFast: options?.failFast,
      writeVector: async (row, vector) => {
        await writeImageDescriptionEmbedding(
          row.knowledgeBaseId,
          row.pageId,
          row.imagePath,
          Embedder.pgvectorLiteral(vector),
          currentModel,
        );
      },
    });

    return {
      currentModel,
      considered: rows.length,
      embedded: result.embedded,
      skipped: result.skipped,
    };
  }
}
