import { readFile } from "node:fs/promises";
import { Chunkifier } from "../chunkifier/index.ts";
import {
  ImageDescriptionEnricher,
  ImageDescValidationError,
} from "../image-desc/index.ts";
import { Ingester } from "../ingest/index.ts";
import {
  deleteKnowledgePagesMissingSourcePaths,
  findPageContentHash,
  Page,
} from "../pages/index.ts";
import { listCorpusMarkdownFiles } from "./walk.ts";

/**
 * Walk the checkout docs root, persist changed pages, delete missing paths.
 * @see docs/modern-knowledge-base-design/01-corpus.md
 */
export async function ingestCorpusCheckout(
  checkoutDir: string,
  docsRoot: string,
): Promise<void> {
  const files = await listCorpusMarkdownFiles(checkoutDir, docsRoot);
  const keepSourcePaths = files.map((file) => file.sourcePath);
  const enricher = new ImageDescriptionEnricher();

  for (const file of files) {
    const source = await readFile(file.absolutePath, "utf8");
    const ingested = Ingester.ingestMarkdown(source);

    // Run image-description enrichment before the body-hash check.
    // Orphan opener without closer fails the whole file; other enricher
    // failures (vision API error, missing image) log and skip just that
    // image so the rest of the page still proceeds.
    let enrichedBody = ingested.body;
    try {
      const enrichment = await enricher.enrich({
        pageId: file.slug,
        sourceAbsPath: file.absolutePath,
        body: ingested.body,
      });
      enrichedBody = enrichment.body;
    } catch (err) {
      if (err instanceof ImageDescValidationError) {
        // Surface orphan image_desc as a top-level issue for the walker to
        // report (it can't be salvaged — skip the file).
        throw err;
      }
      // Otherwise the enricher swallowed per-image errors; body unchanged.
    }

    const fields = {
      title: ingested.title,
      type: ingested.type,
      tags: ingested.tags,
      body: enrichedBody,
    };
    const storedHash = await findPageContentHash(file.slug);
    if (storedHash !== null && storedHash === Page.pageContentHash(fields)) {
      continue;
    }

    const chunks = Chunkifier.chunkify(enrichedBody);
    await Page.save({
      id: file.slug,
      slug: file.slug,
      title: ingested.title,
      type: ingested.type,
      tags: ingested.tags,
      body: enrichedBody,
      sourcePath: file.sourcePath,
      chunks,
    });
  }

  await deleteKnowledgePagesMissingSourcePaths(keepSourcePaths);
}
