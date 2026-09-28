import { readFile } from "node:fs/promises";
import { Chunkifier } from "../chunkifier/index.ts";
import {
  deleteKnowledgePagesMissingSourcePaths,
  findPageContentHash,
  Page,
} from "../pages/index.ts";
import { Ingester } from "./service.ts";
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
    const ingested = Ingester.ingestMarkdown(source);
    const body = ingested.body;

    const fields = {
      title: ingested.title,
      type: ingested.type,
      tags: ingested.tags,
      body,
    };
    const storedHash = await findPageContentHash(file.slug);
    if (storedHash !== null && storedHash === Page.pageContentHash(fields)) {
      continue;
    }

    const chunks = Chunkifier.chunkify(body);
    await Page.save({
      id: file.slug,
      slug: file.slug,
      title: ingested.title,
      type: ingested.type,
      tags: ingested.tags,
      body,
      sourcePath: file.sourcePath,
      chunks,
    });
  }

  await deleteKnowledgePagesMissingSourcePaths(keepSourcePaths);
}
