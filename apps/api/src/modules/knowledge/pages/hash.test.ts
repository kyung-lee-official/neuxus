import { describe, expect, test } from "bun:test";
import { Page } from "./service.ts";

describe("Page.pageContentHash", () => {
  test("same fields same hash; tag order does not matter", () => {
    const a = Page.pageContentHash({
      title: "T",
      tags: ["b", "a"],
      body: "Hi\n",
    });
    const b = Page.pageContentHash({
      title: "T",
      tags: ["a", "b"],
      body: "Hi\n",
    });
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  test("does not collide on adjacent field values", () => {
    const left = Page.pageContentHash({
      title: "ab",
      tags: [],
      body: "",
    });
    const right = Page.pageContentHash({
      title: "a",
      tags: [],
      body: "",
    });
    expect(left).not.toBe(right);
  });
});
