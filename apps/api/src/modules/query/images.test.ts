import { describe, expect, test } from "bun:test";
import type {
  RetrievedImage,
  RetrievedParent,
} from "../knowledge/retriever/index.ts";
import { formatKnowledgeContext } from "./images.ts";

function parent(overrides: Partial<RetrievedParent> = {}): RetrievedParent {
  return {
    parentId: "p1:par:0",
    pageId: "p1",
    title: "North Quay Relay",
    sourcePath: "guide/relay.md",
    text: "## Wiring\n\n![North quay](assets/wiring.png)\n\nThe relay sits between the two quays.",
    score: 0.9,
    ...overrides,
  };
}

function image(overrides: Partial<RetrievedImage> = {}): RetrievedImage {
  return {
    pageId: "p1",
    title: "North Quay Relay",
    imagePath: "guide/assets/wiring.png",
    description: "A relay switch between two quays, with a 12V line labeled A.",
    score: 0.8,
    ...overrides,
  };
}

describe("formatKnowledgeContext", () => {
  test("replaces an inline image ref with its description", () => {
    const text = formatKnowledgeContext([parent()], [image()]);
    expect(text).toContain("### North Quay Relay");
    expect(text).toContain(
      "A relay switch between two quays, with a 12V line labeled A.",
    );
    expect(text).not.toContain("![North quay]");
    expect(text).toContain("The relay sits between the two quays.");
  });

  test("appends an unmatched image hit labelled with its page title", () => {
    const text = formatKnowledgeContext(
      [parent()],
      [image({ pageId: "p2", imagePath: "other.png", title: "Other Page" })],
    );
    // Inline ref has no matching row → left as-is.
    expect(text).toContain("![North quay](assets/wiring.png)");
    expect(text).toContain(
      "Other Page — A relay switch between two quays, with a 12V line labeled A.",
    );
  });

  test("does not append an image already substituted inline", () => {
    const text = formatKnowledgeContext([parent()], [image()]);
    // The label form is only used for unmatched hits.
    expect(text).not.toContain("North Quay Relay — ");
  });
});
