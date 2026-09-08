import {
  TASK_EMBEDDING,
  TASK_MD_IMAGE_CAPTIONING,
  TASK_TEXT_SYNTHESIS,
} from "./dal.ts";

/** Task id — derived from the canonical constants in `dal.ts`. */
export type ModelTaskId =
  | typeof TASK_EMBEDDING
  | typeof TASK_TEXT_SYNTHESIS
  | typeof TASK_MD_IMAGE_CAPTIONING;
