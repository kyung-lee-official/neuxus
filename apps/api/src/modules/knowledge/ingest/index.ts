export {
  type IngestCorpusCheckoutResult,
  ingestCorpusCheckout,
} from "./ingest-checkout.ts";
export { normalizeBody, normalizeNewlines } from "./normalize.ts";
export { Ingester, type IngestMarkdownResult } from "./service.ts";
export {
  type CorpusMarkdownFile,
  idFromPath,
  listCorpusMarkdownFiles,
  pathHasDotSegment,
} from "./walk.ts";
