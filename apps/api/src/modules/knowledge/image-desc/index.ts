/**
 * Public surface of the image-description caption pass.
 *
 * Modules:
 *   - dal.ts         : CRUD + caption queries for `kb_image_descriptions`
 *   - pipeline.ts    : caption pass (vision model → description rows)
 *   - resolve.ts     : body-relative path → absolute filesystem path
 *   - parse.ts       : image-ref extraction (for ingest policy reconciliation)
 *   - validate.ts    : orphan-opener detection
 *
 * The vision model is selected at runtime from the `md-image-captioning`
 * task link (see `ImageCaptioner` in pipeline.ts).
 */

export {
  type CaptionCandidate,
  findImageDescription,
  type ImageCaptionFields,
  listImageDescriptionsByPage,
  listVisionCaptionCandidates,
  updateImageCaption,
  upsertImageDescription,
} from "./dal.ts";
export {
  type CaptionPassOptions,
  type CaptionPassResult,
  ImageCaptioner,
  type ImageDescriber,
} from "./pipeline.ts";
export { resolveImagePath } from "./resolve.ts";
