import { describe, expect, test } from "bun:test";
import { canonicalImagePath, parseImageMeta } from "./image-meta.ts";

describe("canonicalImagePath", () => {
  test("same-folder ref", () => {
    expect(canonicalImagePath("guide/install.md", "./a.png")).toBe(
      "guide/a.png",
    );
  });

  test("root page", () => {
    expect(canonicalImagePath("README.md", "a.png")).toBe("a.png");
  });

  test("parent refs are normalized", () => {
    expect(canonicalImagePath("guide/sub/page.md", "../assets/a.png")).toBe(
      "guide/assets/a.png",
    );
  });

  test("absolute and URL refs are out of contract", () => {
    expect(canonicalImagePath("a.md", "/etc/a.png")).toBeNull();
    expect(canonicalImagePath("a.md", "https://x/a.png")).toBeNull();
    expect(canonicalImagePath("a.md", "C:\\x\\a.png")).toBeNull();
  });
});

describe("parseImageMeta", () => {
  test("entry requires a policy", () => {
    const parsed = parseImageMeta('"a.png":\n  policy: vision-captioning\n');
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.entries.get("a.png")).toEqual({
      policy: "vision-captioning",
    });
  });

  test("manual entry keeps its description", () => {
    const parsed = parseImageMeta(
      'a.png:\n  policy: manual\n  description: "hand written"\n',
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.entries.get("a.png")).toEqual({
      policy: "manual",
      description: "hand written",
    });
  });

  test("block scalar description", () => {
    const parsed = parseImageMeta(
      "a.png:\n  policy: manual\n  description: |\n    line one\n    line two\n",
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.entries.get("a.png")?.description).toBe("line one\nline two");
  });

  test("manual without description is an error", () => {
    const parsed = parseImageMeta("a.png:\n  policy: manual\n");
    expect(parsed.ok).toBe(false);
  });

  test("invalid policy is an error", () => {
    const parsed = parseImageMeta("a.png:\n  policy: bogus\n");
    expect(parsed.ok).toBe(false);
  });

  test("unknown key is an error", () => {
    const parsed = parseImageMeta("a.png:\n  policy: ignore\n  color: red\n");
    expect(parsed.ok).toBe(false);
  });
});
