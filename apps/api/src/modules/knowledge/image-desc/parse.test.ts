import { describe, expect, test } from "bun:test";
import { normalize } from "node:path";
import { dedupByPath, imageRefsByLine, parseImageRefs } from "./parse.ts";

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

  test("markdown image", () => {
    const refs = parseImageRefs("![Alt](./a.png)", "/abs/dir/foo.md");
    expect(refs).toHaveLength(1);
    expect(refs[0]!.imagePath).toBe("./a.png");
    expect(n(refs[0]!.absolutePath)).toBe("/abs/dir/a.png");
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

describe("fenced code blocks", () => {
  test("image-like line inside a fence is ignored", () => {
    const body = ["```md", "![x](./a.png)", "```"].join("\n");
    expect(parseImageRefs(body, "/abs/dir/foo.md")).toEqual([]);
  });

  test("a real image after a closed fence is detected", () => {
    const body = ["```md", "![x](./a.png)", "```", "![y](./b.png)"].join("\n");
    const refs = parseImageRefs(body, "/abs/dir/foo.md");
    expect(refs).toHaveLength(1);
    expect(refs[0]!.imagePath).toBe("./b.png");
    expect(refs[0]!.imageLine).toBe(3);
  });

  test("an unclosed fence hides the rest of the body", () => {
    const body = ["```md", "![x](./a.png)"].join("\n");
    expect(parseImageRefs(body, "/abs/dir/foo.md")).toEqual([]);
  });

  test("tilde fences are code too", () => {
    const body = ["~~~", "![x](./a.png)", "~~~"].join("\n");
    expect(parseImageRefs(body, "/abs/dir/foo.md")).toEqual([]);
  });

  test("imageRefsByLine skips fenced lines", () => {
    const body = ["```", "![x](./a.png)", "```", "![y](./b.png)"].join("\n");
    expect([...imageRefsByLine(body).keys()]).toEqual([3]);
  });
});
