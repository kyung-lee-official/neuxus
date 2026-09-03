/**
 * Public surface of the image-description enricher.
 *
 * Modules:
 *   - validate.ts    : orphan-opener detection (fail-fast trigger)
 *   - parse.ts       : image-ref extraction + strict manual pair
 *   - resolve.ts     : body-relative path → absolute filesystem path
 *   - store.ts       : Prisma CRUD for kb_image_descriptions
 *   - provider.ts    : MiniMax vision LLM (one description per image)
 *   - pipeline.ts    : enrichImagesWithDescriptions() orchestrator
 */

export { dedupByPath, type ParsedImageRef, parseImageRefs } from "./parse.ts";
export {
  defaultPersistHooks,
  type EnrichmentResult,
  type EnrichOptions,
  enrichImagesWithDescriptions,
  ImageDescValidationError,
  type PersistHooks,
} from "./pipeline.ts";
export {
  createMinimaxImageDescriber,
  type ImageDescriber,
} from "./provider.ts";
export { resolveImagePath } from "./resolve.ts";
export {
  findImageDescription,
  type ImageDescRow,
  upsertImageDescription,
} from "./store.ts";
export {
  findOrphanImageDescBlocks,
  findOrphanImageDescOpeners,
  type OrphanImageDesc,
} from "./validate.ts";
