import { describe, expect, test } from "bun:test";
import { pageContentHash } from "./hash.ts";

describe("pageContentHash", () => {
  test("same fields same hash; tag order does not matter", () => {
    const a = pageContentHash({
      title: "T",
      type: "note",
      tags: ["b", "a"],
      body: "Hi\n",
    });
    const b = pageContentHash({
      title: "T",
      type: "note",
      tags: ["a", "b"],
      body: "Hi\n",
    });
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  test("does not collide on concatenated title+type", () => {
    const left = pageContentHash({
      title: "ab",
      type: "c",
      tags: [],
      body: "",
    });
    const right = pageContentHash({
      title: "a",
      type: "bc",
      tags: [],
      body: "",
    });
    expect(left).not.toBe(right);
  });
});
