import { describe, expect, test } from "bun:test";
import {
  findOrphanImageDescBlocks,
  findOrphanImageDescOpeners,
} from "./validate.ts";

describe("findOrphanImageDescOpeners", () => {
  test("no image_desc → empty", () => {
    expect(findOrphanImageDescOpeners("hello\nworld")).toEqual([]);
  });

  test("matched pair → empty", () => {
    const body = [
      "<!-- image_desc -->",
      "description",
      "<!-- /image_desc -->",
    ].join("\n");
    expect(findOrphanImageDescOpeners(body)).toEqual([]);
  });

  test("orphan opener → reported", () => {
    const body = ["<!-- image_desc -->", "no closer here"].join("\n");
    const orphans = findOrphanImageDescOpeners(body);
    expect(orphans).toHaveLength(1);
    expect(orphans[0]!.line).toBe(1);
    expect(orphans[0]!.text).toBe("<!-- image_desc -->");
  });

  test("one matched pair + one orphan opener", () => {
    const body = [
      "<!-- image_desc -->",
      "first description",
      "<!-- /image_desc -->",
      "",
      "<!-- image_desc -->",
      "no closer",
    ].join("\n");
    const orphans = findOrphanImageDescOpeners(body);
    expect(orphans).toHaveLength(1);
    expect(orphans[0]!.line).toBe(5);
  });

  test("nested-like opens: opener at line 1, closer at line 3, opener at line 5 with no closer", () => {
    const body = [
      "<!-- image_desc -->",
      "a",
      "<!-- /image_desc -->",
      "",
      "<!-- image_desc -->",
      "b",
    ].join("\n");
    const orphans = findOrphanImageDescOpeners(body);
    expect(orphans).toHaveLength(1);
    expect(orphans[0]!.line).toBe(5);
  });

  test("closer without opener is ignored", () => {
    const body = ["some text", "<!-- /image_desc -->", "more text"].join("\n");
    expect(findOrphanImageDescOpeners(body)).toEqual([]);
  });
});

describe("findOrphanImageDescBlocks", () => {
  test("paired with image → no orphan", () => {
    const body = [
      "![Alt](./a.png)",
      "",
      "<!-- image_desc -->",
      "description",
      "<!-- /image_desc -->",
    ].join("\n");
    expect(findOrphanImageDescBlocks(body)).toEqual([]);
  });

  test("paired but no preceding image → orphan block (warning only)", () => {
    const body = [
      "## Heading",
      "",
      "<!-- image_desc -->",
      "orphan block",
      "<!-- /image_desc -->",
    ].join("\n");
    const orphans = findOrphanImageDescBlocks(body);
    expect(orphans).toHaveLength(1);
    expect(orphans[0]!.line).toBe(3);
  });

  test("image with intervening blank line is still considered preceding", () => {
    const body = [
      "![Alt](./a.png)",
      "",
      "<!-- image_desc -->",
      "description",
      "<!-- /image_desc -->",
    ].join("\n");
    expect(findOrphanImageDescBlocks(body)).toEqual([]);
  });
});
