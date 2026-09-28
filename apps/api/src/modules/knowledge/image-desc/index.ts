/**
 * Public surface of the image-description passes.
 *
 * Modules:
 *   - service.ts    : caption + description embedding passes
 *   - dal.ts        : CRUD + caption/embed queries for `kb_image_descriptions`
 *   - reconcile.ts   : ingest-side policy reconciliation (meta file → rows)
 *   - image-meta.ts  : `<page>.meta.yaml` parsing + canonical image paths
 *   - parse.ts       : image-ref extraction (for ingest policy reconciliation)
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
export {
  canonicalImagePath,
  DESCRIBED_IMAGE_POLICIES,
  IMAGE_POLICIES,
  type ImageMetaEntry,
  type ImageMetaParse,
  type ImagePolicy,
  parseImageMeta,
} from "./image-meta.ts";
export { imageRefsByLine } from "./parse.ts";
export {
  type ReconcileOptions,
  type ReconcileResult,
  reconcilePageImagePolicies,
} from "./reconcile.ts";
export {
  type CaptionPassOptions,
  type CaptionPassResult,
  type EmbedImageDescriptionsOptions,
  type EmbedImageDescriptionsResult,
  ImageCaptioner,
  type ImageDescriber,
  ImageDescriptionEmbedder,
} from "./service.ts";
