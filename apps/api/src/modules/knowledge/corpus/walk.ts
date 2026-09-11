import { existsSync } from "node:fs";
import { lstat, readdir, realpath, stat } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { CorpusGitError } from "./git.ts";

export type CorpusMarkdownFile = {
  sourcePath: string;
  slug: string;
  absolutePath: string;
};

const DOCS_ROOT_PATTERN = /^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/;

export function assertSafeDocsRoot(docsRoot: string): void {
  if (docsRoot === "") return;
  const unsafe =
    !DOCS_ROOT_PATTERN.test(docsRoot) ||
    docsRoot.split("/").some((s) => s.startsWith("."));
  if (unsafe) {
    throw new CorpusGitError(400, "docs root is not a safe relative path");
  }
}

/** True when any POSIX path segment starts with `.`. */
export function pathHasDotSegment(posixRel: string): boolean {
  return posixRel.split("/").some((segment) => segment.startsWith("."));
}

export function slugFromSourcePath(sourcePath: string): string {
  return sourcePath.replace(/\.md$/i, "");
}

function toPosixRelative(docsAbs: string, fileAbs: string): string {
  return relative(docsAbs, fileAbs).split(sep).join("/");
}

function isInsideRoot(rootAbs: string, candidateAbs: string): boolean {
  const rel = relative(rootAbs, candidateAbs);
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}

/**
 * Recursively list `*.md` under the docs root. Skips dot-segments and
 * symlinks that resolve outside the docs root.
 * @see docs/modern-knowledge-base-design/01-corpus.md
 */
export async function listCorpusMarkdownFiles(
  checkoutDir: string,
  docsRoot: string,
): Promise<CorpusMarkdownFile[]> {
  assertSafeDocsRoot(docsRoot);
  const docsAbs = resolve(checkoutDir, docsRoot);
  if (!existsSync(docsAbs)) {
    throw new CorpusGitError(400, `Docs root not found: ${docsRoot}`);
  }
  const docsStat = await stat(docsAbs);
  if (!docsStat.isDirectory()) {
    throw new CorpusGitError(400, `Docs root is not a directory: ${docsRoot}`);
  }

  const docsReal = await realpath(docsAbs);
  const files: CorpusMarkdownFile[] = [];
  await walkDir(docsReal, docsReal, files);
  files.sort((a, b) =>
    a.sourcePath < b.sourcePath ? -1 : a.sourcePath > b.sourcePath ? 1 : 0,
  );

  const seen = new Set<string>();
  for (const file of files) {
    if (seen.has(file.slug)) {
      throw new CorpusGitError(400, `Duplicate slug: ${file.slug}`);
    }
    seen.add(file.slug);
  }
  return files;
}

async function walkDir(
  docsReal: string,
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
      if (!isInsideRoot(docsReal, target)) continue;
      const targetStat = await stat(target);
      if (targetStat.isDirectory()) {
        await walkDir(docsReal, target, out);
      } else if (targetStat.isFile() && entry.name.endsWith(".md")) {
        pushMarkdown(docsReal, target, out);
      }
      continue;
    }
    if (info.isDirectory()) {
      await walkDir(docsReal, abs, out);
      continue;
    }
    if (info.isFile() && entry.name.endsWith(".md")) {
      pushMarkdown(docsReal, abs, out);
    }
  }
}

function pushMarkdown(
  docsReal: string,
  fileAbs: string,
  out: CorpusMarkdownFile[],
): void {
  const sourcePath = toPosixRelative(docsReal, fileAbs);
  if (sourcePath === "" || pathHasDotSegment(sourcePath)) return;
  if (!sourcePath.endsWith(".md")) return;
  const slug = slugFromSourcePath(sourcePath);
  if (slug === "") return;
  out.push({ sourcePath, slug, absolutePath: fileAbs });
}
