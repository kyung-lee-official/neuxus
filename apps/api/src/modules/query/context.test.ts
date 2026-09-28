import { describe, expect, test } from "bun:test";
import { buildSynthesisPrompt } from "./context.ts";

describe("buildSynthesisPrompt", () => {
  test("includes parent title and text", () => {
    const prompt = buildSynthesisPrompt(
      [],
      "How do I setup?",
      [],
      [
        {
          parentId: "1",
          pageId: "p",
          title: "Setup",
          sourcePath: "setup.md",
          text: "Run bun install.",
          score: 0.9,
        },
      ],
    );
    expect(prompt).toContain("Knowledge base:");
    expect(prompt).toContain("### Setup");
    expect(prompt).toContain("Run bun install.");
    expect(prompt).toContain("How do I setup?");
  });
});
