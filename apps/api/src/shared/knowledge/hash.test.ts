import { describe, expect, test } from "bun:test";
import { hashesMatch, pageContentHash } from "./hash.ts";

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

describe("hashesMatch", () => {
  const fields = {
    title: "T",
    type: null as string | null,
    tags: [] as string[],
    body: "Hi\n",
  };

  test("false when nothing is stored", () => {
    expect(hashesMatch(null, fields)).toBe(false);
  });

  test("true when stored hash equals current fields", () => {
    expect(hashesMatch(pageContentHash(fields), fields)).toBe(true);
  });

  test("false when body changed", () => {
    expect(hashesMatch(pageContentHash(fields), { ...fields, body: "Bye\n" })).toBe(
      false,
    );
  });
});
