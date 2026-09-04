/**
 * Image-description enricher pipeline. Reads the markdown body of a
 * page, finds every image reference, and ensures `kb_image_descriptions`
 * has an up-to-date row for each unique image. The body's content is
 * returned with any newly-injected image_desc block(s) folded in.
 *
 * Rules:
 *   - One image is identified by its `(absolutePath, contentHash)`.
 *   - If the body's image is immediately preceded by an
 *     `<!-- image_desc -->` opener, that opener is treated as the
 *     author's manual description: description text is whatever sits
 *     between the opener and the `<!-- /image_desc -->` closer.
 *     `content_hash` is refreshed to current image bytes.
 *   - Otherwise, the LLM vision provider is called to generate a
 *     description, which is wrapped in a fresh open/close pair and
 *     injected directly after the image line in the body.
 *   - The walker-level validator catches orphan openers (no closer)
 *     beforehand and fail-fasts the page; this pipeline never produces
 *     one.
 */

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";

import { getImageDescriber } from "../models/routing.ts";
import type { ImageDescriber } from "../models/types.ts";
import { dedupByPath, type ParsedImageRef, parseImageRefs } from "./parse.ts";
import { findImageDescription, upsertImageDescription } from "./store.ts";
import { findOrphanImageDescOpeners } from "./validate.ts";

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

export type EnrichmentResult = {
  /** The (possibly rewritten) body — description blocks folded in for LLM-described images. */
  body: string;
  /** Count of images that ended up calling the vision LLM. */
  llmCalls: number;
  /** Count of images whose stored description was reused (manual or cache hit). */
  cachedCalls: number;
};

/**
 * Persistence hooks. Injected so the pipeline is testable without a real
 * Prisma client; production uses the default implementations from store.ts.
 */
export type PersistHooks = {
  findStored: typeof findImageDescription;
  upsertStored: typeof upsertImageDescription;
};

export const defaultPersistHooks: PersistHooks = {
  findStored: findImageDescription,
  upsertStored: upsertImageDescription,
};

export type EnrichOptions = {
  pageId: string;
  /** Absolute filesystem path of the markdown source file (read-only). */
  sourceAbsPath: string;
  body: string;
  /**
   * Override the vision provider. If omitted, an image describer is
   * built from the configured vision model via `getImageDescriber()`.
   */
  describer?: ImageDescriber;
  /**
   * Override persistence hooks (used by tests). Defaults to the live
   * Prisma-backed `store.ts` lookups.
   */
  persist?: PersistHooks;
};

/**
 * Validate first (fail-fast the page if any image_desc opener has no
 * closer), then enrich each unique image and return the rewritten body.
 */
export async function enrichImagesWithDescriptions(
  options: EnrichOptions,
): Promise<EnrichmentResult> {
  const orphans = findOrphanImageDescOpeners(options.body);
  if (orphans.length > 0) {
    throw new ImageDescValidationError(
      `image_desc opener without closer at line ${orphans[0]!.line}: ${orphans[0]!.text}`,
    );
  }

  const allRefs = parseImageRefs(options.body, options.sourceAbsPath);
  const refs = dedupByPath(allRefs);

  const describer = options.describer ?? (await buildDefaultDescriber());
  const persist = options.persist ?? defaultPersistHooks;

  let body = options.body;
  let llmCalls = 0;
  let cachedCalls = 0;

  for (const ref of refs) {
    const result = await enrichOne(
      body,
      ref,
      describer,
      persist,
      options.pageId,
    );
    body = result.body;
    llmCalls += result.llmCalls;
    cachedCalls += result.cachedCalls;
  }

  return { body, llmCalls, cachedCalls };
}

export class ImageDescValidationError extends Error {}

async function buildDefaultDescriber(): Promise<ImageDescriber> {
  return getImageDescriber();
}

async function enrichOne(
  body: string,
  ref: ParsedImageRef,
  describer: ImageDescriber,
  persist: PersistHooks,
  pageId: string,
): Promise<{ body: string; llmCalls: number; cachedCalls: number }> {
  // Read image bytes + compute hash. A read failure aborts just this image;
  // the caller decides whether to skip or fail-fast the page.
  let bytes: Buffer;
  try {
    bytes = await readFile(ref.absolutePath);
  } catch {
    // Missing image file — leave the body untouched and the caller will
    // log the warning. No LLM call, no DB write.
    return { body, llmCalls: 0, cachedCalls: 0 };
  }
  const contentHash = sha256Hex(bytes);

  // Manual description → keep author's wording, just refresh hash.
  if (ref.hasManualDescription) {
    const description = extractManualDescription(body, ref);
    if (description === null) {
      // No closer found — that's an orphan opener, but the validator
      // already would have caught it before we got here. Defensive bail.
      return { body, llmCalls: 0, cachedCalls: 0 };
    }
    await persist.upsertStored({
      pageId,
      imagePath: ref.imagePath,
      contentHash,
      description,
    });
    return { body, llmCalls: 0, cachedCalls: 1 };
  }

  // No manual description → check the cache (by image path under the
  // current page), then fall back to the LLM.
  const stored = await persist.findStored(pageId, ref.imagePath);
  if (stored && stored.contentHash === contentHash) {
    return { body, llmCalls: 0, cachedCalls: 1 };
  }

  const mimeType = mimeTypeFor(ref.absolutePath);
  let description: string;
  try {
    description = await describer.describe({
      absolutePath: ref.absolutePath,
      bytes,
      mimeType,
    });
  } catch {
    return { body, llmCalls: 0, cachedCalls: 0 };
  }
  description = description.replace(/\s+/g, " ").trim();

  await persist.upsertStored({
    pageId,
    imagePath: ref.imagePath,
    contentHash,
    description,
  });

  const block = `<!-- image_desc -->\n${description}\n<!-- /image_desc -->`;
  const newBody = injectImageDescBlock(body, ref, block);
  return { body: newBody, llmCalls: 1, cachedCalls: 0 };
}

/**
 * Extract the description text from `<!-- image_desc -->` ... `<!-- /image_desc -->`.
 * The image line sits between the opener and the closer; the description
 * is whatever's between the image line and the closer.
 *
 * Returns null if the closer can't be found (validator should have
 * caught this earlier).
 */
function extractManualDescription(
  body: string,
  ref: ParsedImageRef,
): string | null {
  if (ref.manualOpenerStart === undefined) return null;
  // Opener line ends at the next \n (or EOF).
  const openerLineEnd = body.indexOf("\n", ref.manualOpenerStart);
  const openerEnd = openerLineEnd === -1 ? body.length : openerLineEnd + 1;
  // The closer must come AFTER the opener, anywhere in the body up to
  // the image line. Look for the first one after the opener — and verify
  // it is actually before the image.
  const closerIdx = body.indexOf("<!-- /image_desc -->", openerEnd);
  if (closerIdx === -1 || closerIdx >= ref.imageStart) return null;
  // Description = text between the opener line and the closer line.
  return body.slice(openerEnd, closerIdx).trim();
}

/**
 * Insert an image_desc block immediately after the image line in `body`.
 * If a manual block is already present, replace its content with the new
 * block.
 */
function injectImageDescBlock(
  body: string,
  ref: ParsedImageRef,
  block: string,
): string {
  const imageLineEnd = body.indexOf("\n", ref.imageStart);
  const imageLine =
    imageLineEnd === -1
      ? body.slice(ref.imageStart)
      : body.slice(ref.imageStart, imageLineEnd + 1);
  const afterImage = imageLineEnd === -1 ? "" : body.slice(imageLineEnd + 1);

  // If the manual opener already exists, the existing block sits between
  // the opener line and the image line; we only need to replace the body
  // content between image line and closer line.
  if (ref.hasManualDescription && ref.manualOpenerStart !== undefined) {
    const closerIdx = body.indexOf("<!-- /image_desc -->", imageLineEnd);
    if (closerIdx === -1) return body;
    const before = body.slice(0, imageLineEnd + 1);
    const after = body.slice(closerIdx);
    return before + "\n" + block + "\n" + after;
  }

  return body.slice(0, imageLineEnd + 1) + "\n" + block + "\n" + afterImage;
}
