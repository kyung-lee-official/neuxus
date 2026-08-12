import { describe, expect, test } from "bun:test";
import { chunkify } from "./index.ts";

describe("chunkify v1", () => {
  test("empty body → no chunks", () => {
    expect(chunkify("")).toEqual({ parents: [], children: [] });
    expect(chunkify("   \n\n")).toEqual({ parents: [], children: [] });
  });

  test("short page → one parent, one child, exact slice", () => {
    const body = "Hello world.\n";
    const { parents, children } = chunkify(body);
    expect(parents).toHaveLength(1);
    expect(children).toHaveLength(1);
    expect(parents[0]!.text).toBe(
      body.slice(parents[0]!.start, parents[0]!.end),
    );
    expect(children[0]!.text).toBe(
      body.slice(children[0]!.start, children[0]!.end),
    );
    expect(children[0]!.parentIndex).toBe(0);
  });

  test("## sections become separate parents", () => {
    const body = `## One

Alpha.

## Two

Beta.
`;
    const { parents, children } = chunkify(body);
    expect(parents.length).toBe(2);
    expect(parents[0]!.text).toContain("## One");
    expect(parents[1]!.text).toContain("## Two");
    expect(
      children.every((c) => c.parentIndex === 0 || c.parentIndex === 1),
    ).toBe(true);
  });

  test("fence stays atomic and intro glue attaches", () => {
    const body = `## Examples

Here is the setup code:

\`\`\`ts
export const x = 1;
\`\`\`
`;
    const { children } = chunkify(body);
    const withFence = children.find((c) => c.text.includes("```ts"));
    expect(withFence).toBeDefined();
    expect(withFence!.text).toContain("Here is the setup code:");
    expect(withFence!.text).toContain("export const x = 1;");
  });

  test("image-desc glues to image in same child", () => {
    const body = `## Fig

![Alt](./a.png)

<!-- image-desc -->
A diagram of the flow.
<!-- /image-desc -->
`;
    const { children } = chunkify(body);
    const hit = children.find((c) => c.text.includes("image-desc"));
    expect(hit).toBeDefined();
    expect(hit!.text).toContain("![Alt](./a.png)");
    expect(hit!.text).toContain("A diagram of the flow.");
  });

  test("blank lines preserved inside multi-block child span", () => {
    const body = `## S

Alpha paragraph.

Beta paragraph.
`;
    const { children } = chunkify(body, {
      childTargetTokens: 400,
      childHardMaxTokens: 500,
    });
    const child = children.find((c) => c.text.includes("Alpha"));
    expect(child).toBeDefined();
    expect(child!.text).toContain("Alpha paragraph.\n\nBeta paragraph.");
  });

  test("unclosed fence consumes through EOF", () => {
    const body = `## C

\`\`\`js
console.log(1);
`;
    const { children } = chunkify(body);
    const fence = children.find((c) => c.text.includes("```js"));
    expect(fence).toBeDefined();
    expect(fence!.text).toContain("console.log(1);");
  });

  test("oversized fence becomes its own child without slicing", () => {
    const code = Array.from(
      { length: 80 },
      (_, i) => `const n${i} = ${i};`,
    ).join("\n");
    const body = `## Big

\`\`\`ts
${code}
\`\`\`
`;
    const { children } = chunkify(body, {
      childTargetTokens: 50,
      childHardMaxTokens: 80,
    });
    const fenceChild = children.find((c) => c.text.includes("```ts"));
    expect(fenceChild).toBeDefined();
    expect(fenceChild!.text).toContain("const n0 = 0;");
    expect(fenceChild!.text).toContain("const n79 = 79;");
  });
});
