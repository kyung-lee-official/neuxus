/**
 * Synthesis image handling: fold image-description hits into the KB context.
 * A parent's inline `![…](…)` is replaced in the prompt only; a hit not matched
 * to any parent is appended, labelled with its page title.
 * @see docs/modern-knowledge-base-design/05-synthesis.md
 */

import {
  canonicalImagePath,
  imageRefsByLine,
} from "../knowledge/image-desc/index.ts";
import type {
  RetrievedImage,
  RetrievedParent,
} from "../knowledge/retriever/index.ts";

function imageKey(pageId: string, imagePath: string): string {
  return `${pageId}\u0000${imagePath}`;
}

/** Replace a parent's inline image lines with matching descriptions. */
function substituteParentImages(
  parent: RetrievedParent,
  imageByPath: Map<string, RetrievedImage>,
  used: Set<string>,
): string {
  if (imageByPath.size === 0) return parent.text;

  const refs = imageRefsByLine(parent.text);
  if (refs.size === 0) return parent.text;

  const byLine = new Map<number, string>();
  for (const [line, ref] of refs) {
    const canonical = canonicalImagePath(parent.sourcePath, ref);
    if (canonical == null) continue;
    const image = imageByPath.get(canonical);
    if (!image || image.description === "") continue;
    byLine.set(line, image.description);
    used.add(imageKey(image.pageId, image.imagePath));
  }
  if (byLine.size === 0) return parent.text;

  return parent.text
    .split("\n")
    .map((line, index) => byLine.get(index) ?? line)
    .join("\n");
}

/**
 * Format the KB context: parents (with inline images substituted) followed by
 * any image hits not matched to a parent, labelled with their page title.
 */
export function formatKnowledgeContext(
  parents: RetrievedParent[],
  images: RetrievedImage[],
): string {
  const used = new Set<string>();
  const sections: string[] = [];

  for (const parent of parents) {
    const imageByPath = new Map<string, RetrievedImage>();
    for (const image of images) {
      if (image.pageId === parent.pageId)
        imageByPath.set(image.imagePath, image);
    }
    const text = substituteParentImages(parent, imageByPath, used);
    sections.push(parent.title ? `### ${parent.title}\n${text}` : text);
  }

  for (const image of images) {
    if (image.description === "") continue;
    if (used.has(imageKey(image.pageId, image.imagePath))) continue;
    sections.push(
      image.title ? `${image.title} — ${image.description}` : image.description,
    );
  }

  return sections.join("\n\n");
}
