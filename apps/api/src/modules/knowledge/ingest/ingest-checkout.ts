import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { reconcilePageImagePolicies } from "../image-desc/index.ts";
import { deleteKnowledgePagesMissingIds, Page } from "../pages/index.ts";
import { Ingester } from "./service.ts";
import { listCorpusMarkdownFiles } from "./walk.ts";

function sha256Hex(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

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

export type IngestCorpusCheckoutResult = {
  pagesProcessed: number;
  imagesUpserted: number;
  imagesDeleted: number;
};

/**
 * Walk the checkout, persist pages, write each changed page's image rows, delete
 * pages whose file vanished. Fails fast on any body/sibling `*.meta.yaml`
 * discrepancy (missing/extra entry, out-of-contract reference, online image that
 * is not `ignore` / `manual`). Does not chunk or call a model.
 * @see docs/modern-knowledge-base-design/01-corpus.md
 * @see docs/modern-knowledge-base-design/02-ingest.md
 */
export async function ingestCorpusCheckout(
  knowledgeBaseId: string,
  checkoutDir: string,
): Promise<IngestCorpusCheckoutResult> {
  const files = await listCorpusMarkdownFiles(checkoutDir);
  const keepIds = files.map((file) => file.id);
  let pagesProcessed = 0;
  let imagesUpserted = 0;
  let imagesDeleted = 0;

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
      metaHash: meta.hash,
    });
    if (saved.skipped) continue;

    const reconciled = await reconcilePageImagePolicies({
      knowledgeBaseId,
      pageId: file.id,
      pagePath: file.path,
      sourceAbsPath: file.absolutePath,
      body: ingested.body,
      metaYaml: meta.text,
    });
    imagesUpserted += reconciled.upserted;
    imagesDeleted += reconciled.deleted;
    pagesProcessed += 1;
  }

  await deleteKnowledgePagesMissingIds(knowledgeBaseId, keepIds);
  return { pagesProcessed, imagesUpserted, imagesDeleted };
}
