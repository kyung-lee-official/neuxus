/**
 * Public surface of the image-description caption pass.
 *
 * Modules:
 *   - dal.ts         : CRUD + caption queries for `kb_image_descriptions`
 *   - service.ts    : caption pass (vision model → description rows)
 *   - resolve.ts     : body-relative path → absolute filesystem path
 *   - parse.ts       : image-ref extraction (for ingest policy reconciliation)
 *   - validate.ts    : orphan-opener detection
 *
 * The vision model is selected at runtime from the `md-image-captioning`
 * task link (see `ImageCaptioner` in service.ts).
 */

export {
  findImageDescription,
  type ImageDescriptionRow,
  type ImageDescriptionUpdate,
  type ImageDescriptionWithSource,
  listImageDescriptionsByPage,
  listImageDescriptionsByPolicy,
  updateImageDescription,
  upsertImageDescription,
} from "./dal.ts";
export { resolveImagePath } from "./resolve.ts";
export {
  type CaptionPassOptions,
  type CaptionPassResult,
  ImageCaptioner,
  type ImageDescriber,
} from "./service.ts";
