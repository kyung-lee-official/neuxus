import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  idFromPath,
  listCorpusMarkdownFiles,
  pathHasDotSegment,
} from "./walk.ts";

describe("pathHasDotSegment", () => {
  test("skips hidden files and folders", () => {
    expect(pathHasDotSegment(".hidden.md")).toBe(true);
    expect(pathHasDotSegment("ok/.secret/a.md")).toBe(true);
    expect(pathHasDotSegment("guide/install.md")).toBe(false);
  });
});

describe("idFromPath", () => {
  test("strips the .md suffix and keeps nested POSIX paths", () => {
    expect(idFromPath("guide/install.md")).toBe("guide/install");
    expect(idFromPath("README.md")).toBe("README");
  });
});

describe("listCorpusMarkdownFiles", () => {
  test("walks nested md and skips dot paths", async () => {
    const root = await mkdtemp(join(tmpdir(), "neuxus-corpus-"));
    try {
      await mkdir(join(root, "guide"), { recursive: true });
      await mkdir(join(root, ".hidden"), { recursive: true });
      await writeFile(join(root, "README.md"), "# Hi\n", "utf8");
      await writeFile(join(root, "guide", "install.md"), "# Install\n", "utf8");
      await writeFile(join(root, ".hidden", "no.md"), "# No\n", "utf8");

      const files = await listCorpusMarkdownFiles(root);
      expect(files.map((f) => f.path)).toEqual([
        "README.md",
        "guide/install.md",
      ]);
      expect(files.map((f) => f.id)).toEqual(["README", "guide/install"]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("fails when the checkout is missing", async () => {
    const root = await mkdtemp(join(tmpdir(), "neuxus-corpus-"));
    try {
      await expect(
        listCorpusMarkdownFiles(join(root, "missing")),
      ).rejects.toThrow(/Checkout not found/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("skips symlinks that resolve outside the checkout", async () => {
    const root = await mkdtemp(join(tmpdir(), "neuxus-corpus-"));
    const outside = await mkdtemp(join(tmpdir(), "neuxus-outside-"));
    try {
      await writeFile(join(outside, "leak.md"), "# Leak\n", "utf8");
      await writeFile(join(root, "ok.md"), "# Ok\n", "utf8");
      try {
        await symlink(join(outside, "leak.md"), join(root, "leak.md"));
      } catch {
        return;
      }
      const files = await listCorpusMarkdownFiles(root);
      expect(files.map((f) => f.path)).toEqual(["ok.md"]);
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(outside, { recursive: true, force: true });
    }
  });
});
