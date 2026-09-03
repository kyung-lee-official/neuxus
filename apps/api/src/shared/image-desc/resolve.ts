/**
 * Resolve a relative image path (as written in the markdown body)
 * against the source markdown file's directory, to get an absolute
 * filesystem path that the LLM provider / file reader can open.
 *
 * Recognises three forms as already-absolute (no source-dir join):
 *   1. POSIX: starts with `/`
 *   2. Windows: starts with `C:\` / `D:\` / etc.
 *   3. URL scheme: `protocol://…` (e.g. `https://…`)
 *
 * For relative paths, joins onto the source directory and normalizes
 * `./` and `../` via `path.normalize`.
 */
import { dirname, isAbsolute, normalize } from "node:path";

export function resolveImagePath(
  sourceAbsPath: string,
  imagePath: string,
): string {
  if (isAbsolute(imagePath)) return imagePath;
  if (imagePath.includes("://")) return imagePath;
  return normalize(dirname(sourceAbsPath) + "/" + imagePath);
}
