import { describe, expect, test } from "bun:test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import {
  CHUNKIFY_DEFAULTS,
  type ChunkifyOptions,
  type ChunkifyResult,
  chunkify,
  resolveChunkifyOptions,
} from "./index.ts";
import { normalizeNewlines } from "./lex.ts";

const fixturesDir = join(import.meta.dir, "fixtures");
const fixturesOutDir = join(import.meta.dir, "fixtures-out");

async function loadFixture(name: string): Promise<string> {
  return await Bun.file(join(fixturesDir, name)).text();
}

function assertExactSlices(body: string, result: ChunkifyResult): void {
  for (const p of result.parents) {
    expect(p.text).toBe(body.slice(p.start, p.end));
  }
  for (const c of result.children) {
    expect(c.text).toBe(body.slice(c.start, c.end));
  }
}

/** Contiguous source span covering all parents — pure markdown, no review chrome. */
function pureChunkedMarkdown(
  normalizedBody: string,
  result: ChunkifyResult,
): string {
  if (result.parents.length === 0) return "";
  const start = result.parents[0]!.start;
  const end = result.parents[result.parents.length - 1]!.end;
  return normalizedBody.slice(start, end);
}

async function writeReviewDump(
  fixtureName: string,
  body: string,
  result: ChunkifyResult,
  options?: ChunkifyOptions,
): Promise<void> {
  await mkdir(fixturesOutDir, { recursive: true });
  const base = fixtureName.replace(/\.md$/i, "");
  const normalizedBody = normalizeNewlines(body);
  const resolved = resolveChunkifyOptions(options);

  const payload = {
    fixture: fixtureName,
    options: resolved,
    defaults: CHUNKIFY_DEFAULTS,
    bodyChars: normalizedBody.length,
    parents: result.parents,
    children: result.children,
  };

  await Bun.write(
    join(fixturesOutDir, `${base}.json`),
    `${JSON.stringify(payload, null, 2)}\n`,
  );
  await Bun.write(
    join(fixturesOutDir, `${base}.md`),
    pureChunkedMarkdown(normalizedBody, result),
  );
}

async function runFixture(name: string, options?: ChunkifyOptions) {
  const body = await loadFixture(name);
  const normalizedBody = normalizeNewlines(body);
  const result = chunkify(body, options);
  assertExactSlices(normalizedBody, result);
  await writeReviewDump(name, body, result, options);
  return { body: normalizedBody, ...result };
}

describe("chunkify fixtures", () => {
  test("empty string → no chunks", async () => {
    const result = chunkify("");
    expect(result).toEqual({ parents: [], children: [] });
    await writeReviewDump("empty-string.md", "", result);
  });

  test("whitespace-only.md → no chunks", async () => {
    const body = await loadFixture("whitespace-only.md");
    const result = chunkify(body);
    expect(result).toEqual({ parents: [], children: [] });
    await writeReviewDump("whitespace-only.md", body, result);
  });

  test("short-note.md → one parent, one child", async () => {
    const { parents, children } = await runFixture("short-note.md");
    expect(parents).toHaveLength(1);
    expect(children).toHaveLength(1);
    expect(children[0]!.parentIndex).toBe(0);
    expect(children[0]!.text).toContain("Hello world.");
  });

  test("two-h2-sections.md → one parent per ##", async () => {
    const { parents, children } = await runFixture("two-h2-sections.md");
    expect(parents).toHaveLength(2);
    expect(parents[0]!.text).toContain("## One");
    expect(parents[1]!.text).toContain("## Two");
    expect(
      children.every((c) => c.parentIndex === 0 || c.parentIndex === 1),
    ).toBe(true);
  });

  test("preamble-before-h2.md → preamble is first parent", async () => {
    const { parents } = await runFixture("preamble-before-h2.md");
    expect(parents.length).toBeGreaterThanOrEqual(2);
    expect(parents[0]!.text).toContain("Intro before any section heading.");
    expect(parents[0]!.text).not.toContain("## First");
    expect(parents[1]!.text).toContain("## First");
  });

  test("heading-only.md → one parent, one searchable child", async () => {
    const { parents, children } = await runFixture("heading-only.md");
    expect(parents).toHaveLength(1);
    expect(children).toHaveLength(1);
    expect(children[0]!.text).toContain("## Only heading");
  });

  test("empty-h2.md → empty section still gets a child", async () => {
    const { parents, children } = await runFixture("empty-h2.md");
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
    const { children } = await runFixture("fence-intro-glue.md");
    const withFence = children.find((c) => c.text.includes("```ts"));
    expect(withFence).toBeDefined();
    expect(withFence!.text).toContain("Here is the setup code:");
    expect(withFence!.text).toContain("export const x = 1;");
  });

  test("image-desc-glue.md → image and desc same child", async () => {
    const { children } = await runFixture("image-desc-glue.md");
    const hit = children.find((c) => c.text.includes("image-desc"));
    expect(hit).toBeDefined();
    expect(hit!.text).toContain("![Alt](./a.png)");
    expect(hit!.text).toContain("A diagram of the flow.");
  });

  test("blank-lines-preserved.md → blank line kept in slice", async () => {
    const { children } = await runFixture("blank-lines-preserved.md");
    const child = children.find((c) => c.text.includes("Alpha"));
    expect(child).toBeDefined();
    expect(child!.text).toContain("Alpha paragraph.\n\nBeta paragraph.");
  });

  test("unclosed-fence.md → fence through EOF; interior not re-lexed", async () => {
    const { parents, children } = await runFixture("unclosed-fence.md");
    expect(parents).toHaveLength(1);
    expect(parents[0]!.text).toContain("## C");
    expect(parents.some((p) => p.text.trimStart().startsWith("## XXX"))).toBe(
      false,
    );

    const fence = children.find((c) => c.text.includes("```js"));
    expect(fence).toBeDefined();
    expect(fence!.text).toContain("console.log(1);");
    expect(fence!.text).toContain("## XXX");
    expect(fence!.text).toContain("- not a list either");
    expect(fence!.text.trimEnd().endsWith("```")).toBe(false);
  });

  test("oversized-fence.md → fence not sliced", async () => {
    const { children } = await runFixture("oversized-fence.md", {
      childTargetTokens: 50,
      childHardMaxTokens: 80,
    });
    const fenceChild = children.find((c) => c.text.includes("```ts"));
    expect(fenceChild).toBeDefined();
    expect(fenceChild!.text).toContain("const n0 = 0;");
    expect(fenceChild!.text).toContain("const n79 = 79;");
  });
});
