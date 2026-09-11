import { describe, expect, test } from "bun:test";
import { RETRIEVE_DEFAULTS, resolveRetrieveOptions } from "./defaults.ts";
import {
  type ChildHit,
  capParents,
  type RetrievedParent,
  scoreByParentFromHits,
  uniqueParentIdsByBestScore,
} from "./rank.ts";

function hit(
  parentId: string,
  score: number,
  childId = `${parentId}-c`,
): ChildHit {
  return {
    childId,
    parentId,
    pageId: "p",
    childText: "t",
    score,
  };
}

function parent(
  parentId: string,
  text: string,
  score: number,
): RetrievedParent {
  return {
    parentId,
    pageId: "p",
    slug: "s",
    title: "T",
    text,
    score,
  };
}

describe("resolveRetrieveOptions", () => {
  test("uses app defaults", () => {
    expect(resolveRetrieveOptions()).toEqual({
      childLimit: RETRIEVE_DEFAULTS.childLimit,
      maxParents: RETRIEVE_DEFAULTS.maxParents,
      maxCharacters: RETRIEVE_DEFAULTS.maxCharacters,
    });
  });

  test("rejects non-positive overrides", () => {
    expect(
      resolveRetrieveOptions({
        childLimit: 0,
        maxParents: -1,
        maxCharacters: 3,
      }),
    ).toEqual({
      childLimit: RETRIEVE_DEFAULTS.childLimit,
      maxParents: RETRIEVE_DEFAULTS.maxParents,
      maxCharacters: 3,
    });
  });
});

describe("uniqueParentIdsByBestScore", () => {
  test("keeps first (best) child per parent", () => {
    expect(
      uniqueParentIdsByBestScore([
        hit("a", 0.9, "a1"),
        hit("b", 0.8, "b1"),
        hit("a", 0.7, "a2"),
        hit("c", 0.6, "c1"),
      ]),
    ).toEqual(["a", "b", "c"]);
  });
});

describe("scoreByParentFromHits", () => {
  test("stores the first score for each parent", () => {
    const scores = scoreByParentFromHits([hit("a", 0.9), hit("a", 0.1)]);
    expect(scores.get("a")).toBe(0.9);
  });
});

describe("capParents", () => {
  test("caps count", () => {
    const out = capParents(
      [parent("a", "aa", 1), parent("b", "bb", 0.9), parent("c", "cc", 0.8)],
      2,
      10_000,
    );
    expect(out.map((p) => p.parentId)).toEqual(["a", "b"]);
  });

  test("stops before exceeding the character budget", () => {
    const out = capParents(
      [parent("a", "aaaa", 1), parent("b", "bbbb", 0.9), parent("c", "c", 0.8)],
      8,
      7,
    );
    expect(out.map((p) => p.parentId)).toEqual(["a"]);
  });

  test("always keeps the first parent even if it exceeds the budget", () => {
    const out = capParents([parent("a", "abcdefghij", 1)], 8, 3);
    expect(out).toHaveLength(1);
    expect(out[0]?.parentId).toBe("a");
  });
});
