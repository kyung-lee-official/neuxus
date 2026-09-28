/**
 * Image-description caption pass. Runs after ingest, before embedding.
 *
 * Reads `kb_image_descriptions` rows with `policy = 'vision-captioning'`,
 * captions the stale ones with the model linked to the `md-image-captioning`
 * task, and updates the row. It never touches `kb_pages.body` — descriptions
 * live only in `kb_image_descriptions`.
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
import { listVisionCaptionCandidates, updateImageCaption } from "./dal.ts";
import { resolveImagePath } from "./resolve.ts";

/**
 * Business prompt for the `md-image-captioning` task. Its `sha256` is stored
 * as `caption_prompt_hash`; editing this text re-captions stored rows.
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

    const candidates = await listVisionCaptionCandidates(
      options.knowledgeBaseId,
    );

    let captioned = 0;
    let skipped = 0;
    let failed = 0;

    for (const candidate of candidates) {
      try {
        const sourceAbsPath = join(
          options.checkoutDir,
          options.docsRoot,
          candidate.sourcePath ?? "",
        );
        const imageAbsPath = resolveImagePath(
          sourceAbsPath,
          candidate.imagePath,
        );
        const bytes = await readFile(imageAbsPath);
        const imageContentHash = sha256Hex(bytes);

        const fresh =
          imageContentHash === candidate.imageContentHash &&
          candidate.captionModel === currentModel &&
          candidate.captionPromptHash === currentPromptHash &&
          candidate.descriptionHash != null;
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

        await updateImageCaption(
          options.knowledgeBaseId,
          candidate.pageId,
          candidate.imagePath,
          {
            imageContentHash,
            description,
            captionModel: currentModel,
            captionPromptHash: currentPromptHash,
            descriptionHash: sha256Hex(Buffer.from(description, "utf8")),
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
