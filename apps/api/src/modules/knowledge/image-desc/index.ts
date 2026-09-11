/**
 * Public surface of the image-description enricher.
 *
 * Modules:
 *   - validate.ts    : orphan-opener detection (fail-fast trigger)
 *   - parse.ts       : image-ref extraction + strict manual pair
 *   - resolve.ts     : body-relative path → absolute filesystem path
 *   - store.ts       : Prisma CRUD for kb_image_descriptions
 *   - pipeline.ts    : enrichImagesWithDescriptions() orchestrator
 *
 * The vision LLM client itself lives in `shared/models/clients/vision.ts`
 * and is selected at runtime by `shared/models/routing.ts`.
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
