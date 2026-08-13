import { describe, expect, test } from "bun:test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { normalizeBody } from "../ingest/normalize.ts";
import { legalSnapIndices, pickCutEnd, pickOverlapStart } from "./children.ts";
import {
  CHUNKIFY_DEFAULTS,
  type ChunkifyOptions,
  type ChunkifyResult,
  chunkify,
  resolveChunkifyOptions,
} from "./index.ts";
import { lexBlocks } from "./lex.ts";
import { countTokens } from "./tokenize.ts";

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
  const normalizedBody = normalizeBody(body);
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
  const normalizedBody = normalizeBody(body);
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

  test("re-applies ingest body normalize (CRLF, trailing spaces, final \\n)", () => {
    const raw = "Hello  \r\nworld\t";
    const body = normalizeBody(raw);
    expect(body).toBe("Hello\nworld\n");
    const result = chunkify(raw);
    expect(result.parents).toHaveLength(1);
    expect(result.parents[0]!.text).toBe(body);
    expect(result.children[0]!.text).toBe(body);
    assertExactSlices(body, result);
  });

  test("short-note.md → one parent, one child", async () => {
    const { parents, children } = await runFixture("short-note.md");
    expect(parents).toHaveLength(1);
    expect(children).toHaveLength(1);
    expect(children[0]!.parentIndex).toBe(0);
    expect(children[0]!.text).toContain("Hello world.");
  });

  test("two-h2-sections.md → one parent per ##", async () => {
    const { body, parents, children } = await runFixture("two-h2-sections.md");
    expect(parents).toHaveLength(2);
    expect(parents[0]!.text).toContain("## One");
    expect(parents[1]!.text).toContain("## Two");
    expect(
      children.every((c) => c.parentIndex === 0 || c.parentIndex === 1),
    ).toBe(true);
    expect(parents[0]!.start).toBe(0);
    expect(parents[0]!.end).toBe(parents[1]!.start);
    expect(parents[1]!.end).toBe(body.length);
    expect(parents[0]!.text.endsWith("\n")).toBe(true);
    expect(parents[0]!.text).not.toContain("## Two");
    const lastOfOne = children.filter((c) => c.parentIndex === 0).at(-1);
    expect(lastOfOne?.end).toBe(parents[0]!.end);
    expect(lastOfOne?.text.endsWith("\n")).toBe(true);
  });

  test("preamble-before-h2.md → preamble is first parent", async () => {
    const { body, parents } = await runFixture("preamble-before-h2.md");
    expect(parents.length).toBeGreaterThanOrEqual(2);
    expect(parents[0]!.text).toContain("Intro before any section heading.");
    expect(parents[0]!.text).not.toContain("## First");
    expect(parents[1]!.text).toContain("## First");
    expect(parents[0]!.end).toBe(parents[1]!.start);
    expect(parents[0]!.text.endsWith("\n")).toBe(true);
    expect(parents[parents.length - 1]!.end).toBe(body.length);
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

  test("image-desc without image is an HTML block", () => {
    const body = [
      "## Fig",
      "",
      "<!-- image-desc -->",
      "Orphan description.",
      "<!-- /image-desc -->",
      "",
    ].join("\n");
    const kinds = lexBlocks(body)
      .filter((b) => b.kind !== "blank")
      .map((b) => b.kind);
    expect(kinds).toEqual(["heading", "html"]);
    expect(kinds).not.toContain("image_desc");
  });

  test("image-desc markers match only after trim, not inner spaces", () => {
    const exact = lexBlocks(
      "![Alt](./a.png)\n\n  <!-- image-desc -->  \nDesc.\n<!-- /image-desc -->\n",
    );
    expect(exact.some((b) => b.kind === "image_desc")).toBe(true);

    const loose = lexBlocks(
      "![Alt](./a.png)\n\n<!--  image-desc  -->\nDesc.\n<!-- /image-desc -->\n",
    );
    expect(loose.some((b) => b.kind === "image_desc")).toBe(false);
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

  test("mixed pack stops at target, not hard max", () => {
    const encoding = CHUNKIFY_DEFAULTS.tokenizerEncoding;
    const words: string[] = [];
    while (countTokens(words.join(" "), encoding) < 80) {
      words.push(`word${words.length}`);
    }
    const body = `# Title\n\n${words.join(" ")}`;
    const { children } = chunkify(body, {
      childTargetTokens: 20,
      childHardMaxTokens: 400,
    });
    const heading = children.find((c) => c.text.includes("# Title"));
    const prose = children.find((c) => c.text.includes("word0"));
    expect(heading).toBeDefined();
    expect(prose).toBeDefined();
    expect(heading!.text).not.toContain("word0");
    expect(prose!.text).not.toContain("# Title");
  });
});

describe("force-split snap indices", () => {
  test("legal snaps: sentence + newline; not 3.14 or e.g.", () => {
    const text = "See e.g. the 3.14 value.\nNext line.";
    const idx = legalSnapIndices(text);
    expect(idx[0]).toBe(0);
    expect(idx[idx.length - 1]).toBe(text.length);
    const afterValue = text.indexOf("value.") + "value.".length;
    expect(idx).toContain(afterValue);
    expect(idx).toContain(text.indexOf("\n") + 1);
    expect(idx).not.toContain(text.indexOf("3.14") + 1);
    expect(idx).not.toContain(text.indexOf("e.g.") + 2);
  });

  test("previous piece owns spaces after terminator", () => {
    const text = "Hello.  World";
    const idx = legalSnapIndices(text);
    expect(idx).toContain("Hello.  ".length);
    expect("Hello.  World".slice("Hello.  ".length)).toBe("World");
  });

  test("cut end prefers last legal snap at or before target", () => {
    const encoding = CHUNKIFY_DEFAULTS.tokenizerEncoding;
    const a = "One sentence here. ";
    const b = "Two sentence here. ";
    const c = "Three sentence here.";
    const text = a + b + c;
    const target = countTokens(a, encoding);
    const hard = countTokens(a + b + c, encoding);
    expect(pickCutEnd(text, target, hard, encoding)).toBe(a.length);
  });

  test("overlap start is a legal index with largest tail under budget", () => {
    const encoding = CHUNKIFY_DEFAULTS.tokenizerEncoding;
    const piece = "Alpha words here. Beta words here. Gamma.";
    const cutLegal = legalSnapIndices(piece).filter((i) => i > 0);
    expect(cutLegal.length).toBeGreaterThan(1);
    const S = pickOverlapStart(piece, 20, encoding);
    expect(legalSnapIndices(piece)).toContain(S);
    expect(S).toBeGreaterThan(0);
    expect(S).toBeLessThanOrEqual(piece.length);
    expect(countTokens(piece.slice(S), encoding)).toBeLessThanOrEqual(20);
  });

  test("chunkify force-split: ends and overlap starts are legal", () => {
    const sentences = Array.from(
      { length: 40 },
      (_, i) => `Sentence number ${i} sits here.`,
    );
    const body = sentences.join(" ");
    const options: ChunkifyOptions = {
      childTargetTokens: 40,
      childHardMaxTokens: 55,
      childOverlapTokens: 15,
    };
    const result = chunkify(body, options);
    expect(result.children.length).toBeGreaterThan(1);

    const paraStart = result.parents[0]!.start;
    const paraText = result.parents[0]!.text;

    for (let i = 0; i < result.children.length; i++) {
      const child = result.children[i]!;
      if (i < result.children.length - 1) {
        const remaining = paraText.slice(child.start - paraStart);
        expect(legalSnapIndices(remaining)).toContain(child.end - child.start);
      }
      if (i > 0) {
        const prev = result.children[i - 1]!;
        expect(child.start).toBeGreaterThan(prev.start);
        expect(child.start).toBeLessThanOrEqual(prev.end);
        const piece = body.slice(prev.start, prev.end);
        expect(legalSnapIndices(piece)).toContain(child.start - prev.start);
      }
    }
  });
});

