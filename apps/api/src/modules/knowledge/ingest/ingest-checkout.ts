import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { Chunkifier } from "../chunkifier/index.ts";
import {
  deleteKnowledgePagesMissingSourcePaths,
  Page,
} from "../pages/index.ts";
import { Ingester } from "./service.ts";
import { listCorpusMarkdownFiles } from "./walk.ts";

function sha256Hex(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** sha256 of the sibling `*.meta.yaml` bytes, or null when it is absent. */
async function metaHashFor(pageAbsPath: string): Promise<string | null> {
  const sidecar = join(
    dirname(pageAbsPath),
    `${basename(pageAbsPath, ".md")}.meta.yaml`,
  );
  try {
    return sha256Hex(await readFile(sidecar));
  } catch {
    return null;
  }
}

/**
 * Walk the checkout docs root, persist pages, delete missing source paths.
 * @see docs/modern-knowledge-base-design/01-corpus.md
 * @see docs/modern-knowledge-base-design/02-ingest.md
 */
export async function ingestCorpusCheckout(
  knowledgeBaseId: string,
  checkoutDir: string,
  docsRoot: string,
): Promise<void> {
  const files = await listCorpusMarkdownFiles(checkoutDir, docsRoot);
  const keepSourcePaths = files.map((file) => file.sourcePath);

  for (const file of files) {
    const source = await readFile(file.absolutePath, "utf8");
    const ingested = Ingester.ingestMarkdown(source);
    const body = ingested.body;
    const metaHash = await metaHashFor(file.absolutePath);

    const chunks = Chunkifier.chunkify(body);
    await Page.save({
      knowledgeBaseId,
      id: file.id,
      title: ingested.title,
      tags: ingested.tags,
      body,
      sourcePath: file.sourcePath,
      metaHash,
      chunks,
    });
  }

  await deleteKnowledgePagesMissingSourcePaths(
    knowledgeBaseId,
    keepSourcePaths,
  );
}
