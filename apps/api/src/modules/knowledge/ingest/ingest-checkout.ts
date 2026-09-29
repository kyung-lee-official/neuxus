import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { Logger } from "../../log/index.ts";
import { reconcilePageImagePolicies } from "../image-desc/index.ts";
import {
  deleteKnowledgePagesMissingSourcePaths,
  findPageHashes,
  Page,
} from "../pages/index.ts";
import { Ingester } from "./service.ts";
import { listCorpusMarkdownFiles } from "./walk.ts";

function sha256Hex(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

const ingestLog = Logger.child({ module: "ingest" }, "ingest");

/**
 * Sibling `*.meta.yaml` bytes: its sha256 and raw text, or nulls when absent.
 */
async function readMetaFile(
  pageAbsPath: string,
): Promise<{ hash: string | null; text: string | null }> {
  const metaPath = join(
    dirname(pageAbsPath),
    `${basename(pageAbsPath, ".md")}.meta.yaml`,
  );
  try {
    const bytes = await readFile(metaPath);
    return { hash: sha256Hex(bytes), text: bytes.toString("utf8") };
  } catch {
    return { hash: null, text: null };
  }
}

/**
 * Reconcile one page's image policy rows, logging warnings.
 * @see docs/modern-knowledge-base-design/02-ingest.md
 */
async function reconcileFileImages(args: {
  knowledgeBaseId: string;
  id: string;
  sourcePath: string;
  absolutePath: string;
  body: string;
  metaYaml: string | null;
}): Promise<{ upserted: number; deleted: number }> {
  const reconciled = await reconcilePageImagePolicies({
    knowledgeBaseId: args.knowledgeBaseId,
    pageId: args.id,
    sourcePath: args.sourcePath,
    sourceAbsPath: args.absolutePath,
    body: args.body,
    metaYaml: args.metaYaml,
  });
  for (const warning of reconciled.warnings) {
    ingestLog.warn(warning, {
      knowledgeBaseId: args.knowledgeBaseId,
      pageId: args.id,
    });
  }
  return { upserted: reconciled.upserted, deleted: reconciled.deleted };
}

export type IngestCorpusCheckoutResult = {
  /**
   * Page ids upserted this run (content or meta changed). The caller feeds
   * these to the image-policy reconciliation stage.
   */
  changedPageIds: string[];
};

/**
 * Walk the checkout docs root, persist pages, delete missing source paths.
 * Does not chunk or reconcile — `Page.chunkifyPages` and the reconciliation
 * stage are separate.
 * @see docs/modern-knowledge-base-design/01-corpus.md
 * @see docs/modern-knowledge-base-design/02-ingest.md
 */
export async function ingestCorpusCheckout(
  knowledgeBaseId: string,
  checkoutDir: string,
  docsRoot: string,
): Promise<IngestCorpusCheckoutResult> {
  const files = await listCorpusMarkdownFiles(checkoutDir, docsRoot);
  const keepSourcePaths = files.map((file) => file.sourcePath);
  const changedPageIds: string[] = [];

  for (const file of files) {
    const source = await readFile(file.absolutePath, "utf8");
    const ingested = Ingester.ingestMarkdown(source);
    const meta = await readMetaFile(file.absolutePath);

    const saved = await Page.save({
      knowledgeBaseId,
      id: file.id,
      title: ingested.title,
      tags: ingested.tags,
      body: ingested.body,
      sourcePath: file.sourcePath,
      metaHash: meta.hash,
    });
    if (saved.skipped) continue;
    changedPageIds.push(file.id);
  }

  await deleteKnowledgePagesMissingSourcePaths(
    knowledgeBaseId,
    keepSourcePaths,
  );
  return { changedPageIds };
}

export type ReconcileCorpusImagesResult = {
  pagesProcessed: number;
  imagesUpserted: number;
  imagesDeleted: number;
};

export type ReconcileCorpusImagesOptions = {
  /**
   * Restrict to these page ids (e.g. the ingest changed set). Omit to reconcile
   * every already-ingested corpus page.
   */
  pageIds?: string[];
};

/**
 * Image-policy reconciliation stage: for each target page, record what to do
 * with each image it references in `kb_image_descriptions`. Pages absent from
 * `kb_pages` are skipped. Never calls a model.
 * @see docs/modern-knowledge-base-design/02-ingest.md
 */
export async function reconcileCorpusImages(
  knowledgeBaseId: string,
  checkoutDir: string,
  docsRoot: string,
  options?: ReconcileCorpusImagesOptions,
): Promise<ReconcileCorpusImagesResult> {
  const files = await listCorpusMarkdownFiles(checkoutDir, docsRoot);
  const only = options?.pageIds ? new Set(options.pageIds) : null;
  let pagesProcessed = 0;
  let imagesUpserted = 0;
  let imagesDeleted = 0;

  for (const file of files) {
    if (only && !only.has(file.id)) continue;
    const stored = await findPageHashes(knowledgeBaseId, file.id);
    if (!stored) continue;

    const source = await readFile(file.absolutePath, "utf8");
    const body = Ingester.ingestMarkdown(source).body;
    const meta = await readMetaFile(file.absolutePath);

    try {
      const result = await reconcileFileImages({
        knowledgeBaseId,
        id: file.id,
        sourcePath: file.sourcePath,
        absolutePath: file.absolutePath,
        body,
        metaYaml: meta.text,
      });
      imagesUpserted += result.upserted;
      imagesDeleted += result.deleted;
      pagesProcessed += 1;
    } catch (error) {
      ingestLog.error(
        `image policy reconciliation failed for ${file.sourcePath}`,
        {
          knowledgeBaseId,
          pageId: file.id,
          error: error instanceof Error ? error.message : String(error),
        },
      );
    }
  }

  return { pagesProcessed, imagesUpserted, imagesDeleted };
}
