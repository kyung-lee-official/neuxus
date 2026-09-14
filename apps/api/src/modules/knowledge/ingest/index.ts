export { ingestCorpusCheckout } from "./ingest-checkout.ts";
export { normalizeBody, normalizeNewlines } from "./normalize.ts";
export { Ingester, type IngestMarkdownResult } from "./service.ts";
export {
  assertSafeDocsRoot,
  type CorpusMarkdownFile,
  listCorpusMarkdownFiles,
  pathHasDotSegment,
  slugFromSourcePath,
} from "./walk.ts";
