/**
 * Ingest-side image policy reconciliation: record each image the body
 * references as a `kb_image_descriptions` row — `policy`, plus the manual
 * description when the sibling `*.meta.yaml` says so. Rows for images the page
 * no longer references are deleted. Policy only — never calls a model and never
 * reads image bytes (`image_content_hash` is owned by the caption pass).
 *
 * @see docs/modern-knowledge-base-design/02-ingest.md
 */

import { createHash } from "node:crypto";
import { deleteImageDescriptionsNotIn, upsertImagePolicy } from "./dal.ts";
import {
  canonicalImagePath,
  type ImageMetaEntry,
  parseImageMeta,
} from "./image-meta.ts";
import { dedupByPath, parseImageRefs } from "./parse.ts";

function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export type ReconcileOptions = {
  knowledgeBaseId: string;
  pageId: string;
  /** Repo-root-relative POSIX path of the page. */
  pagePath: string;
  /** Absolute path of the page file on disk. */
  sourceAbsPath: string;
  body: string;
  /** Raw sibling `*.meta.yaml` contents, or null when absent. */
  metaYaml: string | null;
};

export type ReconcileResult = {
  upserted: number;
  deleted: number;
};

/**
 * Write one page's image rows. Fails fast (throws) on any body/`*.meta.yaml`
 * discrepancy: an out-of-contract reference, an image with no entry, an entry
 * the body does not reference, or an online image that is not `ignore` /
 * `manual`. Never clears the caption pass's fields.
 */
export async function reconcilePageImagePolicies(
  options: ReconcileOptions,
): Promise<ReconcileResult> {
  let entries = new Map<string, ImageMetaEntry>();
  if (options.metaYaml != null) {
    const parsed = parseImageMeta(options.metaYaml);
    if (!parsed.ok) {
      throw new Error(
        `invalid *.meta.yaml for ${options.pagePath}: ${parsed.error}`,
      );
    }
    entries = parsed.entries;
  }

  const refs = dedupByPath(parseImageRefs(options.body, options.sourceAbsPath));
  const desiredPaths: string[] = [];
  let upserted = 0;

  for (const ref of refs) {
    const imagePath = canonicalImagePath(options.pagePath, ref.imagePath);
    if (imagePath == null) {
      throw new Error(
        `out-of-contract image reference in ${options.pagePath}: ${ref.imagePath}`,
      );
    }
    const entry = entries.get(imagePath);
    if (entry == null) {
      throw new Error(
        `image not listed in the sibling *.meta.yaml for ${options.pagePath}: ${ref.imagePath}`,
      );
    }
    if (entry.policy === "vision-captioning" && imagePath.includes("://")) {
      throw new Error(
        `online image cannot be vision-captioning in ${options.pagePath}: ${ref.imagePath}`,
      );
    }
    await upsertImagePolicy(
      options.knowledgeBaseId,
      options.pageId,
      imagePath,
      {
        policy: entry.policy,
        ...(entry.policy === "manual"
          ? {
              description: entry.description ?? "",
              descriptionHash: sha256Hex(entry.description ?? ""),
            }
          : entry.policy === "ignore"
            ? { description: null, descriptionHash: null }
            : {}),
      },
    );
    desiredPaths.push(imagePath);
    upserted += 1;
  }

  for (const key of entries.keys()) {
    if (!desiredPaths.includes(key)) {
      throw new Error(
        `*.meta.yaml entry not referenced by the body in ${options.pagePath}: ${key}`,
      );
    }
  }

  const deleted = await deleteImageDescriptionsNotIn(
    options.knowledgeBaseId,
    options.pageId,
    desiredPaths,
  );
  return { upserted, deleted };
}
