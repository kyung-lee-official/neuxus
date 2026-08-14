import { readFile } from "node:fs/promises";
import { chunkify } from "../chunkify/index.ts";
import { ingestMarkdown } from "../ingest/index.ts";
import {
  deleteKnowledgePagesMissingSourcePaths,
  findPageContentHash,
  hashesMatch,
  persistKnowledgePage,
} from "../knowledge/index.ts";
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

  for (const file of files) {
    const source = await readFile(file.absolutePath, "utf8");
    const ingested = ingestMarkdown(source);
    const fields = {
      title: ingested.title,
      type: ingested.type,
      tags: ingested.tags,
      body: ingested.body,
    };
    const storedHash = await findPageContentHash(file.slug);
    if (hashesMatch(storedHash, fields)) continue;

    const chunks = chunkify(ingested.body);
    await persistKnowledgePage({
      id: file.slug,
      slug: file.slug,
      title: ingested.title,
      type: ingested.type,
      tags: ingested.tags,
      body: ingested.body,
      sourcePath: file.sourcePath,
      chunks,
    });
  }

  await deleteKnowledgePagesMissingSourcePaths(keepSourcePaths);
}
