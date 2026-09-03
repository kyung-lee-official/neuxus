import { describe, expect, test } from "bun:test";
import { normalize } from "node:path";
import { dedupByPath, parseImageRefs } from "./parse.ts";

/**
 * Normalize path separators for portable assertions (Windows
 * `path.normalize` produces backslashes; POSIX produces forward slashes).
 */
function n(p: string): string {
  return normalize(p).replace(/\\/g, "/");
}

describe("parseImageRefs", () => {
  test("no images → empty", () => {
    expect(parseImageRefs("just text\nmore text", "/abs/dir/foo.md")).toEqual(
      [],
    );
  });

  test("markdown image without opener", () => {
    const refs = parseImageRefs("![Alt](./a.png)", "/abs/dir/foo.md");
    expect(refs).toHaveLength(1);
    expect(refs[0]!.imagePath).toBe("./a.png");
    expect(refs[0]!.hasManualDescription).toBe(false);
    expect(n(refs[0]!.absolutePath)).toBe("/abs/dir/a.png");
  });

  test("markdown image immediately preceded by opener+closer", () => {
    const body = [
      "<!-- image_desc -->",
      "Author wording.",
      "<!-- /image_desc -->",
      "![Alt](./a.png)",
    ].join("\n");
    const refs = parseImageRefs(body, "/abs/dir/foo.md");
    expect(refs).toHaveLength(1);
    expect(refs[0]!.hasManualDescription).toBe(true);
    expect(refs[0]!.manualOpenerStart).toBeTypeOf("number");
  });

  test("blank line between opener and image is NOT paired (strict)", () => {
    const body = [
      "<!-- image_desc -->",
      "",
      "![Alt](./a.png)",
      "<!-- /image_desc -->",
    ].join("\n");
    const refs = parseImageRefs(body, "/abs/dir/foo.md");
    expect(refs[0]!.hasManualDescription).toBe(false);
  });

  test("image path with title (md form)", () => {
    const refs = parseImageRefs('![Alt](./a.png "title")', "/abs/dir/foo.md");
    expect(refs[0]!.imagePath).toBe("./a.png");
  });

  test("html <img> form", () => {
    const refs = parseImageRefs(
      '<img src="./a.png" alt="x" />',
      "/abs/dir/foo.md",
    );
    expect(refs).toHaveLength(1);
    expect(refs[0]!.imagePath).toBe("./a.png");
    expect(n(refs[0]!.absolutePath)).toBe("/abs/dir/a.png");
  });

  test("absolute image path is honored as-is", () => {
    const refs = parseImageRefs(
      "![x](https://example.com/a.png)",
      "/abs/dir/foo.md",
    );
    expect(refs[0]!.absolutePath).toBe("https://example.com/a.png");
  });
});

describe("dedupByPath", () => {
  test("removes duplicates by absolutePath", () => {
    const body = ["![a](./a.png)", "", "![b](./a.png)"].join("\n");
    const refs = parseImageRefs(body, "/abs/dir/foo.md");
    expect(refs).toHaveLength(2);
    const deduped = dedupByPath(refs);
    expect(deduped).toHaveLength(1);
    expect(deduped[0]!.imageLine).toBe(refs[0]!.imageLine);
  });

  test("keeps different paths", () => {
    const body = ["![a](./a.png)", "", "![b](./b.png)"].join("\n");
    const refs = parseImageRefs(body, "/abs/dir/foo.md");
    const deduped = dedupByPath(refs);
    expect(deduped).toHaveLength(2);
  });
});
