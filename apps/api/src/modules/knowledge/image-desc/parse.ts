/**
 * Parse a markdown body for image references (`![…](…)` or `<img …>`),
 * and pair each with any author-authored image_desc opener that
 * immediately precedes it (strict — no blank line between).
 *
 * Pairing rule (strict):
 *   1. Find an image line.
 *   2. Walk backward over blank lines only.
 *   3. If the immediately preceding non-blank line is exactly the
 *      `<!-- image_desc -->` opener, that's a manual pair.
 *   4. Otherwise the image has no manual description.
 *
 * The closing line `<!-- /image_desc -->` is NOT consulted here — it
 * must have come with the opener (otherwise the body validator at the
 * walker level fail-fasts the file).
 */

import { resolveImagePath } from "./resolve.ts";

const OPENER_LINE = "<!-- image_desc -->";
const CLOSER_LINE = "<!-- /image_desc -->";
const IMAGE_MD = /^!\[.*?\]\(.*\)\s*$/;
const IMAGE_HTML = /^<img\b[^>]*>\s*$/i;

export type ParsedImageRef = {
  /** 0-based line index of the image line in the body. */
  imageLine: number;
  /** 0-based byte offset of the image line in the body (start). */
  imageStart: number;
  /** The image markdown text (the entire line, including any trailing newline marker). */
  imageText: string;
  /** The image path as written in the body (the URL inside `()` for MD; the `src=` for HTML). */
  imagePath: string;
  /** Whether a manual `<!-- image_desc -->` opener precedes this image (strictly). */
  hasManualDescription: boolean;
  /** 0-based byte offset of the manual opener line (if any). */
  manualOpenerStart?: number;
  /** Absolute path of the image file on disk, resolved against the source file. */
  absolutePath: string;
};

export function parseImageRefs(
  body: string,
  sourceAbsPath: string,
): ParsedImageRef[] {
  const lines = body.split("\n");
  const results: ParsedImageRef[] = [];
  let byteOffset = 0;
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i]!;
    const mdPath = pathFromMarkdown(t);
    const htmlPath = mdPath == null ? pathFromHtml(t) : null;
    if (mdPath == null && htmlPath == null) {
      byteOffset += t.length + 1;
      continue;
    }
    const imagePath = mdPath ?? htmlPath!;
    const imageStart = byteOffset;
    let manualOpenerStart: number | undefined;
    let hasManualDescription = false;
    // Strict "immediately above": the closer must be the line directly
    // preceding the image. Blank lines between are NOT skipped. The
    // opener can be anywhere above; the validator in validate.ts catches
    // unmatched openers separately.
    if (i > 0 && lines[i - 1]!.trim() === CLOSER_LINE) {
      // Walk back to find the opener.
      let openerLine = -1;
      for (let k = i - 2; k >= 0; k--) {
        if (lines[k]!.trim() === OPENER_LINE) {
          openerLine = k;
          break;
        }
      }
      if (openerLine >= 0) {
        let off = 0;
        for (let m = 0; m < openerLine; m++) off += lines[m]!.length + 1;
        manualOpenerStart = off;
        hasManualDescription = true;
      }
    }
    results.push({
      imageLine: i,
      imageStart,
      imageText: t,
      imagePath,
      hasManualDescription,
      manualOpenerStart,
      absolutePath: resolveImagePath(sourceAbsPath, imagePath),
    });
    byteOffset += t.length + 1;
  }
  return results;
}

function pathFromMarkdown(line: string): string | null {
  const m = IMAGE_MD.exec(line);
  if (!m) return null;
  const open = line.indexOf("](");
  const close = line.lastIndexOf(")");
  if (open < 0 || close <= open + 2) return null;
  let path = line.slice(open + 2, close);
  const titleSep = path.indexOf(" ");
  if (titleSep > 0) path = path.slice(0, titleSep);
  return path.trim();
}

function pathFromHtml(line: string): string | null {
  if (!IMAGE_HTML.test(line)) return null;
  const m =
    /src\s*=\s*"([^"]+)"/i.exec(line) ?? /src\s*=\s*'([^']+)'/i.exec(line);
  return m ? m[1]! : null;
}

/** Dedup by `(absolutePath)` so the same image file isn't processed twice. */
export function dedupByPath(refs: ParsedImageRef[]): ParsedImageRef[] {
  const seen = new Set<string>();
  const out: ParsedImageRef[] = [];
  for (const r of refs) {
    if (seen.has(r.absolutePath)) continue;
    seen.add(r.absolutePath);
    out.push(r);
  }
  return out;
}
