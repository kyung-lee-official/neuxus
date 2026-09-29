/**
 * Ingest-side image policy reconciliation: record each image the body
 * references as a `kb_image_descriptions` row — `policy`, plus the manual
 * description when the sibling `*.meta.yaml` says so. Rows for images the page
 * no longer references are deleted. Policy only — never calls a model and never
 * reads image bytes (`image_content_hash` is owned by the caption pass).
 *
 * @see docs/modern-knowledge-base-design/02-ingest.md
 */

import {
  deleteImageDescriptionsNotIn,
  resetImageDerivedFields,
  upsertImagePolicy,
} from "./dal.ts";
import {
  canonicalImagePath,
  type ImageMetaEntry,
  parseImageMeta,
} from "./image-meta.ts";
import { dedupByPath, parseImageRefs } from "./parse.ts";

export type ReconcileOptions = {
  knowledgeBaseId: string;
  pageId: string;
  /** Docs-root-relative POSIX path of the page. */
  sourcePath: string;
  /** Absolute path of the page file on disk. */
  sourceAbsPath: string;
  body: string;
  /** Raw sibling `*.meta.yaml` contents, or null when absent. */
  metaYaml: string | null;
};

export type ReconcileResult = {
  upserted: number;
  deleted: number;
  warnings: string[];
};

/**
 * Reconcile one page's image rows. Throws when the meta file is malformed (a
 * `manual` entry without a description is an error for the page); out-of-contract
 * references and unreferenced meta entries are reported as warnings.
 */
export async function reconcilePageImagePolicies(
  options: ReconcileOptions,
): Promise<ReconcileResult> {
  const warnings: string[] = [];
  let entries = new Map<string, ImageMetaEntry>();
  if (options.metaYaml != null) {
    const parsed = parseImageMeta(options.metaYaml);
    if (!parsed.ok) {
      throw new Error(
        `invalid *.meta.yaml for ${options.sourcePath}: ${parsed.error}`,
      );
    }
    entries = parsed.entries;
  }

  const refs = dedupByPath(parseImageRefs(options.body, options.sourceAbsPath));
  const desiredPaths: string[] = [];
  let upserted = 0;

  for (const ref of refs) {
    const imagePath = canonicalImagePath(options.sourcePath, ref.imagePath);
    if (imagePath == null) {
      warnings.push(`out-of-contract image reference: ${ref.imagePath}`);
      continue;
    }
    const entry = entries.get(imagePath);
    const policy = entry?.policy ?? "vision-captioning";
    await upsertImagePolicy(
      options.knowledgeBaseId,
      options.pageId,
      imagePath,
      {
        policy,
        ...(policy === "manual"
          ? { description: entry?.description ?? "" }
          : policy === "ignore"
            ? { description: null }
            : {}),
      },
    );
    if (policy !== "vision-captioning") {
      await resetImageDerivedFields(
        options.knowledgeBaseId,
        options.pageId,
        imagePath,
      );
    }
    desiredPaths.push(imagePath);
    upserted += 1;
  }

  for (const key of entries.keys()) {
    if (!desiredPaths.includes(key)) {
      warnings.push(`meta entry not referenced: ${key}`);
    }
  }

  const deleted = await deleteImageDescriptionsNotIn(
    options.knowledgeBaseId,
    options.pageId,
    desiredPaths,
  );
  return { upserted, deleted, warnings };
}
