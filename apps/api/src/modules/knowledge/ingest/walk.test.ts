import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  assertSafeDocsRoot,
  listCorpusMarkdownFiles,
  pathHasDotSegment,
  slugFromSourcePath,
} from "./walk.ts";

describe("pathHasDotSegment", () => {
  test("skips hidden files and folders", () => {
    expect(pathHasDotSegment(".hidden.md")).toBe(true);
    expect(pathHasDotSegment("ok/.secret/a.md")).toBe(true);
    expect(pathHasDotSegment("guide/install.md")).toBe(false);
  });
});

describe("slugFromSourcePath", () => {
  test("strips the .md suffix and keeps nested POSIX paths", () => {
    expect(slugFromSourcePath("guide/install.md")).toBe("guide/install");
    expect(slugFromSourcePath("README.md")).toBe("README");
  });
});

describe("assertSafeDocsRoot", () => {
  test("rejects traversal and absolute-looking values", () => {
    expect(() => assertSafeDocsRoot("../docs")).toThrow(/safe relative path/);
    expect(() => assertSafeDocsRoot("/docs")).toThrow(/safe relative path/);
    expect(() => assertSafeDocsRoot(".hidden")).toThrow(/safe relative path/);
  });

  test("allows nested relative segments", () => {
    expect(() => assertSafeDocsRoot("docs")).not.toThrow();
    expect(() => assertSafeDocsRoot("content/kb")).not.toThrow();
  });
});

describe("listCorpusMarkdownFiles", () => {
  test("walks nested md, skips dot paths, fails when docs root is missing", async () => {
    const root = await mkdtemp(join(tmpdir(), "neuxus-corpus-"));
    try {
      await mkdir(join(root, "docs", "guide"), { recursive: true });
      await mkdir(join(root, "docs", ".hidden"), { recursive: true });
      await writeFile(join(root, "docs", "README.md"), "# Hi\n", "utf8");
      await writeFile(
        join(root, "docs", "guide", "install.md"),
        "# Install\n",
        "utf8",
      );
      await writeFile(join(root, "docs", ".hidden", "no.md"), "# No\n", "utf8");
      await writeFile(join(root, "README.md"), "# Outside\n", "utf8");

      const files = await listCorpusMarkdownFiles(root, "docs");
      expect(files.map((f) => f.sourcePath)).toEqual([
        "README.md",
        "guide/install.md",
      ]);
      expect(files.map((f) => f.slug)).toEqual(["README", "guide/install"]);

      await expect(listCorpusMarkdownFiles(root, "missing")).rejects.toThrow(
        /Docs root not found/,
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("skips symlinks that resolve outside the docs root", async () => {
    const root = await mkdtemp(join(tmpdir(), "neuxus-corpus-"));
    try {
      await mkdir(join(root, "docs"), { recursive: true });
      await mkdir(join(root, "outside"), { recursive: true });
      await writeFile(join(root, "outside", "leak.md"), "# Leak\n", "utf8");
      await writeFile(join(root, "docs", "ok.md"), "# Ok\n", "utf8");
      try {
        await symlink(
          join(root, "outside", "leak.md"),
          join(root, "docs", "leak.md"),
        );
      } catch {
        return;
      }
      const files = await listCorpusMarkdownFiles(root, "docs");
      expect(files.map((f) => f.sourcePath)).toEqual(["ok.md"]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
