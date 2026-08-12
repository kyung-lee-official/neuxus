import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { type ChunkifyOptions, chunkify } from "./index.ts";

const fixturesDir = join(import.meta.dir, "fixtures");

async function loadFixture(name: string): Promise<string> {
  return await Bun.file(join(fixturesDir, name)).text();
}

function assertExactSlices(
  body: string,
  result: ReturnType<typeof chunkify>,
): void {
  for (const p of result.parents) {
    expect(p.text).toBe(body.slice(p.start, p.end));
  }
  for (const c of result.children) {
    expect(c.text).toBe(body.slice(c.start, c.end));
  }
}

function runFixture(name: string, options?: ChunkifyOptions) {
  return async () => {
    const body = await loadFixture(name);
    const result = chunkify(body, options);
    assertExactSlices(body, result);
    return { body, ...result };
  };
}

describe("chunkify fixtures", () => {
  test("empty string → no chunks", () => {
    expect(chunkify("")).toEqual({ parents: [], children: [] });
  });

  test("whitespace-only.md → no chunks", async () => {
    const body = await loadFixture("whitespace-only.md");
    expect(chunkify(body)).toEqual({ parents: [], children: [] });
  });

  test("short-note.md → one parent, one child", async () => {
    const { parents, children } = await runFixture("short-note.md")();
    expect(parents).toHaveLength(1);
    expect(children).toHaveLength(1);
    expect(children[0]!.parentIndex).toBe(0);
    expect(children[0]!.text).toContain("Hello world.");
  });

  test("two-h2-sections.md → one parent per ##", async () => {
    const { parents, children } = await runFixture("two-h2-sections.md")();
    expect(parents).toHaveLength(2);
    expect(parents[0]!.text).toContain("## One");
    expect(parents[1]!.text).toContain("## Two");
    expect(
      children.every((c) => c.parentIndex === 0 || c.parentIndex === 1),
    ).toBe(true);
  });

  test("preamble-before-h2.md → preamble is first parent", async () => {
    const { parents } = await runFixture("preamble-before-h2.md")();
    expect(parents.length).toBeGreaterThanOrEqual(2);
    expect(parents[0]!.text).toContain("Intro before any section heading.");
    expect(parents[0]!.text).not.toContain("## First");
    expect(parents[1]!.text).toContain("## First");
  });

  test("heading-only.md → one parent, one searchable child", async () => {
    const { parents, children } = await runFixture("heading-only.md")();
    expect(parents).toHaveLength(1);
    expect(children).toHaveLength(1);
    expect(children[0]!.text).toContain("## Only heading");
  });

  test("empty-h2.md → empty section still gets a child", async () => {
    const { parents, children } = await runFixture("empty-h2.md")();
    expect(parents.length).toBe(2);
    const emptyParent = parents.find((p) => p.text.includes("## Empty"));
    expect(emptyParent).toBeDefined();
    const emptyChildren = children.filter(
      (c) => c.parentIndex === emptyParent!.index,
    );
    expect(emptyChildren.length).toBeGreaterThanOrEqual(1);
    expect(emptyChildren[0]!.text).toContain("## Empty");
  });

  test("fence-intro-glue.md → intro stays with fence", async () => {
    const { children } = await runFixture("fence-intro-glue.md")();
    const withFence = children.find((c) => c.text.includes("```ts"));
    expect(withFence).toBeDefined();
    expect(withFence!.text).toContain("Here is the setup code:");
    expect(withFence!.text).toContain("export const x = 1;");
  });

  test("image-desc-glue.md → image and desc same child", async () => {
    const { children } = await runFixture("image-desc-glue.md")();
    const hit = children.find((c) => c.text.includes("image-desc"));
    expect(hit).toBeDefined();
    expect(hit!.text).toContain("![Alt](./a.png)");
    expect(hit!.text).toContain("A diagram of the flow.");
  });

  test("blank-lines-preserved.md → blank line kept in slice", async () => {
    const { children } = await runFixture("blank-lines-preserved.md")();
    const child = children.find((c) => c.text.includes("Alpha"));
    expect(child).toBeDefined();
    expect(child!.text).toContain("Alpha paragraph.\n\nBeta paragraph.");
  });

  test("unclosed-fence.md → fence through EOF", async () => {
    const { children } = await runFixture("unclosed-fence.md")();
    const fence = children.find((c) => c.text.includes("```js"));
    expect(fence).toBeDefined();
    expect(fence!.text).toContain("console.log(1);");
    expect(fence!.text.trimEnd().endsWith("```")).toBe(false);
  });

  test("oversized-fence.md → fence not sliced", async () => {
    const { children } = await runFixture("oversized-fence.md", {
      childTargetTokens: 50,
      childHardMaxTokens: 80,
    })();
    const fenceChild = children.find((c) => c.text.includes("```ts"));
    expect(fenceChild).toBeDefined();
    expect(fenceChild!.text).toContain("const n0 = 0;");
    expect(fenceChild!.text).toContain("const n79 = 79;");
  });
});
