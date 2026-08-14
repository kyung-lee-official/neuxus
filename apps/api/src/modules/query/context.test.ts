import { describe, expect, test } from "bun:test";
import { buildSynthesisPrompt } from "./context.ts";

describe("buildSynthesisPrompt", () => {
  test("includes parent title, slug, and text", () => {
    const prompt = buildSynthesisPrompt(
      [],
      "How do I setup?",
      [],
      [
        {
          parentId: "1",
          pageId: "p",
          slug: "setup",
          title: "Setup",
          text: "Run bun install.",
          score: 0.9,
        },
      ],
    );
    expect(prompt).toContain("Knowledge base (parent context):");
    expect(prompt).toContain("Setup · setup");
    expect(prompt).toContain("Run bun install.");
    expect(prompt).toContain("How do I setup?");
  });
});
