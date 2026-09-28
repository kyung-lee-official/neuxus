import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { Logger } from "../../log/index.ts";
import { Chunkifier, type ChunkifyOptions } from "../chunkifier/index.ts";
import { reconcilePageImagePolicies } from "../image-desc/index.ts";
import {
  deleteKnowledgePagesMissingSourcePaths,
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
 * Walk the checkout docs root, persist pages, reconcile image policies, delete
 * missing source paths.
 * @see docs/modern-knowledge-base-design/01-corpus.md
 * @see docs/modern-knowledge-base-design/02-ingest.md
 */
export async function ingestCorpusCheckout(
  knowledgeBaseId: string,
  checkoutDir: string,
  docsRoot: string,
  chunkOptions: ChunkifyOptions,
): Promise<void> {
  const files = await listCorpusMarkdownFiles(checkoutDir, docsRoot);
  const keepSourcePaths = files.map((file) => file.sourcePath);

  for (const file of files) {
    const source = await readFile(file.absolutePath, "utf8");
    const ingested = Ingester.ingestMarkdown(source);
    const body = ingested.body;
    const meta = await readMetaFile(file.absolutePath);

    const chunks = Chunkifier.chunkify(body, chunkOptions);
    const saved = await Page.save({
      knowledgeBaseId,
      id: file.id,
      title: ingested.title,
      tags: ingested.tags,
      body,
      sourcePath: file.sourcePath,
      metaHash: meta.hash,
      chunks,
    });
    if (saved.skipped) continue;

    try {
      const reconciled = await reconcilePageImagePolicies({
        knowledgeBaseId,
        pageId: file.id,
        sourcePath: file.sourcePath,
        sourceAbsPath: file.absolutePath,
        body,
        metaYaml: meta.text,
      });
      for (const warning of reconciled.warnings) {
        ingestLog.warn(warning, { knowledgeBaseId, pageId: file.id });
      }
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

  await deleteKnowledgePagesMissingSourcePaths(
    knowledgeBaseId,
    keepSourcePaths,
  );
}
