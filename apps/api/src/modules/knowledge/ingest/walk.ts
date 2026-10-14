import { existsSync } from "node:fs";
import { lstat, readdir, realpath, stat } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { CorpusGitError } from "../errors.ts";

export type CorpusMarkdownFile = {
  path: string;
  id: string;
  absolutePath: string;
};

/** True when any POSIX path segment starts with `.`. */
export function pathHasDotSegment(posixRel: string): boolean {
  return posixRel.split("/").some((segment) => segment.startsWith("."));
}

export function idFromPath(path: string): string {
  return path.replace(/\.md$/i, "");
}

function toPosixRelative(rootAbs: string, fileAbs: string): string {
  return relative(rootAbs, fileAbs).split(sep).join("/");
}

function isInsideRoot(rootAbs: string, candidateAbs: string): boolean {
  const rel = relative(rootAbs, candidateAbs);
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}

/**
 * Recursively list `*.md` under the checkout root. Skips dot-segments and
 * symlinks that resolve outside the checkout.
 * @see docs/modern-knowledge-base-design/01-corpus.md
 */
export async function listCorpusMarkdownFiles(
  checkoutDir: string,
): Promise<CorpusMarkdownFile[]> {
  const rootAbs = resolve(checkoutDir);
  if (!existsSync(rootAbs)) {
    throw new CorpusGitError(400, `Checkout not found: ${checkoutDir}`);
  }
  const rootStat = await stat(rootAbs);
  if (!rootStat.isDirectory()) {
    throw new CorpusGitError(
      400,
      `Checkout is not a directory: ${checkoutDir}`,
    );
  }

  const rootReal = await realpath(rootAbs);
  const files: CorpusMarkdownFile[] = [];
  await walkDir(rootReal, rootReal, files);
  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  const seen = new Set<string>();
  for (const file of files) {
    if (seen.has(file.id)) {
      throw new CorpusGitError(400, `Duplicate id: ${file.id}`);
    }
    seen.add(file.id);
  }
  return files;
}

async function walkDir(
  rootReal: string,
  dirAbs: string,
  out: CorpusMarkdownFile[],
): Promise<void> {
  const entries = await readdir(dirAbs, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const abs = join(dirAbs, entry.name);
    const info = await lstat(abs);
    if (info.isSymbolicLink()) {
      let target: string;
      try {
        target = await realpath(abs);
      } catch {
        continue;
      }
      if (!isInsideRoot(rootReal, target)) continue;
      const targetStat = await stat(target);
      if (targetStat.isDirectory()) {
        await walkDir(rootReal, target, out);
      } else if (targetStat.isFile() && entry.name.endsWith(".md")) {
        pushMarkdown(rootReal, target, out);
      }
      continue;
    }
    if (info.isDirectory()) {
      await walkDir(rootReal, abs, out);
      continue;
    }
    if (info.isFile() && entry.name.endsWith(".md")) {
      pushMarkdown(rootReal, abs, out);
    }
  }
}

function pushMarkdown(
  rootReal: string,
  fileAbs: string,
  out: CorpusMarkdownFile[],
): void {
  const path = toPosixRelative(rootReal, fileAbs);
  if (path === "" || pathHasDotSegment(path)) return;
  if (!path.endsWith(".md")) return;
  const id = idFromPath(path);
  if (id === "") return;
  out.push({ path, id, absolutePath: fileAbs });
}
