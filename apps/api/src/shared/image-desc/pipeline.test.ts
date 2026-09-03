import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  enrichImagesWithDescriptions,
  ImageDescValidationError,
  type PersistHooks,
} from "./pipeline.ts";
import { type ImageDescriber } from "./provider.ts";
import type { ImageDescRow } from "./store.ts";

let workdir: string;

async function makePage(slug: string, body: string, imageBytes: Buffer | null) {
  const dir = join(workdir, slug);
  await mkdir(dir, { recursive: true });
  const filePath = join(dir, "page.md");
  await writeFile(filePath, body, "utf8");
  const imageAbsPath = join(dir, "img.png");
  if (imageBytes !== null) await writeFile(imageAbsPath, imageBytes);
  return { filePath, imageAbsPath, body };
}

function fixedDescriber(reply: string): ImageDescriber {
  return {
    async describe() {
      return reply;
    },
  };
}

function silentDescriber(): ImageDescriber {
  return {
    async describe() {
      throw new Error("describer called when it shouldn't be");
    },
  };
}

/** In-memory persist hooks for tests — no DB required. */
function memoryPersist(): PersistHooks & {
  data: Map<string, ImageDescRow>;
} {
  const data = new Map<string, ImageDescRow>();
  const key = (pageId: string, imagePath: string): string =>
    `${pageId}::${imagePath}`;
  return {
    data,
    findStored: async (pageId, imagePath) => {
      return data.get(key(pageId, imagePath)) ?? null;
    },
    upsertStored: async (row) => {
      data.set(key(row.pageId, row.imagePath), { ...row });
    },
  };
}

afterEach(async () => {
  if (workdir) {
    await rm(workdir, { recursive: true, force: true }).catch(() => {});
  }
});

describe("enrichImagesWithDescriptions", () => {
  test("orphan opener fails fast", async () => {
    workdir = await mkdtemp(join(tmpdir(), "imgdesc-"));
    const body = "<!-- image_desc -->\norphan\n";
    const filePath = join(workdir, "p", "page.md");
    await mkdir(join(workdir, "p"), { recursive: true });
    await writeFile(filePath, body, "utf8");
    await expect(
      enrichImagesWithDescriptions({
        pageId: "src/app/p",
        sourceAbsPath: filePath,
        body,
        describer: silentDescriber(),
        persist: memoryPersist(),
      }),
    ).rejects.toThrow(ImageDescValidationError);
  });

  test("no images → body unchanged, zero counts", async () => {
    workdir = await mkdtemp(join(tmpdir(), "imgdesc-"));
    const filePath = join(workdir, "p", "page.md");
    await mkdir(join(workdir, "p"), { recursive: true });
    const body = "just text\n";
    await writeFile(filePath, body, "utf8");
    const result = await enrichImagesWithDescriptions({
      pageId: "src/app/p",
      sourceAbsPath: filePath,
      body,
      describer: silentDescriber(),
      persist: memoryPersist(),
    });
    expect(result.body).toBe("just text\n");
    expect(result.llmCalls).toBe(0);
    expect(result.cachedCalls).toBe(0);
  });

  test("missing image file → skipped silently, body unchanged", async () => {
    workdir = await mkdtemp(join(tmpdir(), "imgdesc-"));
    const filePath = join(workdir, "p", "page.md");
    await mkdir(join(workdir, "p"), { recursive: true });
    const body = "![Alt](./img.png)\n";
    await writeFile(filePath, body, "utf8");
    const result = await enrichImagesWithDescriptions({
      pageId: "src/app/p",
      sourceAbsPath: filePath,
      body,
      describer: silentDescriber(),
      persist: memoryPersist(),
    });
    expect(result.body).toBe("![Alt](./img.png)\n");
    expect(result.llmCalls).toBe(0);
  });

  test("fresh image → calls LLM, injects block, increments llmCalls", async () => {
    workdir = await mkdtemp(join(tmpdir(), "imgdesc-"));
    const { filePath } = await makePage(
      "p",
      "![Alt](./img.png)\n",
      Buffer.from([0]),
    );
    const persist = memoryPersist();
    const result = await enrichImagesWithDescriptions({
      pageId: "src/app/p",
      sourceAbsPath: filePath,
      body: "![Alt](./img.png)\n",
      describer: fixedDescriber("A diagram of the flow."),
      persist,
    });
    expect(result.llmCalls).toBe(1);
    expect(result.cachedCalls).toBe(0);
    expect(result.body).toBe(
      "![Alt](./img.png)\n" +
        "\n" +
        "<!-- image_desc -->\n" +
        "A diagram of the flow.\n" +
        "<!-- /image_desc -->\n",
    );
    expect(persist.data.size).toBe(1);
  });

  test("same image bytes second run → cache hit, no LLM call", async () => {
    workdir = await mkdtemp(join(tmpdir(), "imgdesc-"));
    const { filePath } = await makePage(
      "p",
      "![Alt](./img.png)\n",
      Buffer.from([0]),
    );
    const persist = memoryPersist();
    const first = await enrichImagesWithDescriptions({
      pageId: "src/app/p",
      sourceAbsPath: filePath,
      body: "![Alt](./img.png)\n",
      describer: fixedDescriber("A diagram."),
      persist,
    });
    expect(first.llmCalls).toBe(1);
    const second = await enrichImagesWithDescriptions({
      pageId: "src/app/p",
      sourceAbsPath: filePath,
      body: first.body,
      describer: silentDescriber(),
      persist,
    });
    expect(second.cachedCalls).toBe(1);
    expect(second.llmCalls).toBe(0);
    expect(second.body).toBe(first.body);
  });

  test("manual opener wins, no LLM call", async () => {
    workdir = await mkdtemp(join(tmpdir(), "imgdesc-"));
    const body =
      "<!-- image_desc -->\nAuthor wording.\n<!-- /image_desc -->\n![Alt](./img.png)\n";
    const { filePath } = await makePage("p", body, Buffer.from([0]));
    const persist = memoryPersist();
    const result = await enrichImagesWithDescriptions({
      pageId: "src/app/p",
      sourceAbsPath: filePath,
      body,
      describer: silentDescriber(),
      persist,
    });
    expect(result.cachedCalls).toBe(1);
    expect(result.llmCalls).toBe(0);
    expect(result.body).toContain("Author wording.");
    expect(persist.data.size).toBe(1);
    const stored = persist.data.get("src/app/p::./img.png");
    expect(stored?.description).toBe("Author wording.");
  });

  test("dedup by absolutePath keeps the first occurrence", async () => {
    workdir = await mkdtemp(join(tmpdir(), "imgdesc-"));
    const { filePath } = await makePage(
      "p",
      "![a](./img.png)\n\n![b](./img.png)\n",
      Buffer.from([0]),
    );
    const result = await enrichImagesWithDescriptions({
      pageId: "src/app/p",
      sourceAbsPath: filePath,
      body: "![a](./img.png)\n\n![b](./img.png)\n",
      describer: fixedDescriber("X"),
      persist: memoryPersist(),
    });
    expect(result.llmCalls).toBe(1);
  });
});
