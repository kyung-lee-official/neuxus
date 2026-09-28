/**
 * Parse a markdown body for image references — `![…](…)` or `<img …>` — and
 * resolve each to an absolute filesystem path against the source file.
 */

import { dirname, isAbsolute, normalize } from "node:path";

const IMAGE_MD = /^!\[.*?\]\(.*\)\s*$/;
const IMAGE_HTML = /^<img\b[^>]*>\s*$/i;

export type ParsedImageRef = {
  /** 0-based line index of the image line in the body. */
  imageLine: number;
  /** 0-based byte offset of the image line in the body (start). */
  imageStart: number;
  /** The image markdown text (the entire line). */
  imageText: string;
  /** The image path as written in the body (the URL inside `()` for MD; the `src=` for HTML). */
  imagePath: string;
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
    results.push({
      imageLine: i,
      imageStart: byteOffset,
      imageText: t,
      imagePath,
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

/**
 * Body references are relative to the page: join onto the source file's
 * directory. Absolute paths and URLs are returned unchanged.
 */
function resolveImagePath(sourceAbsPath: string, imagePath: string): string {
  if (isAbsolute(imagePath)) return imagePath;
  if (imagePath.includes("://")) return imagePath;
  return normalize(`${dirname(sourceAbsPath)}/${imagePath}`);
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
