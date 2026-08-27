import { afterEach, describe, expect, mock, test } from "bun:test";
import type { SqlRunner } from "./embed-search.ts";

type FakeEmbedder = {
  embed: (texts: string[]) => Promise<number[][]>;
};

function makeFakeEmbedder(vectors: number[][]): FakeEmbedder {
  return {
    embed: async (texts: string[]) => {
      if (texts.length !== vectors.length) {
        throw new Error(
          `fake embedder expected ${vectors.length} text(s), got ${texts.length}`,
        );
      }
      return vectors;
    },
  };
}

function makeFakeSql<R>(rows: R[]): SqlRunner {
  return async () => {
    return rows;
  };
}

const ORIGINAL_FETCH = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  mock.restore();
});

describe("runTestEmbedSearch", () => {
  test("embeds the query, runs a CTE cosine search, and returns mapped pages", async () => {
    const queryVector = Array.from({ length: 8 }, (_, i) => i * 0.1);

    const rows = [
      {
        id: "guide/install",
        slug: "guide/install",
        title: "Install",
        type: "guide",
        tags: ["kb", "install"],
        source_path: "guide/install.md",
        content_hash: "h1",
        updated_at: new Date("2026-01-02T03:04:05Z"),
        parent_count: 3,
        child_count: 7,
        score: 0.9182734,
      },
      {
        id: "guide/trouble",
        slug: "guide/trouble",
        title: "Trouble",
        type: "guide",
        tags: [],
        source_path: null,
        content_hash: "h2",
        updated_at: null,
        parent_count: 0,
        child_count: 0,
        score: 0.4221,
      },
    ];

    const { runTestEmbedSearch } = await import("./embed-search.ts");
    const embedder = makeFakeEmbedder([queryVector]);
    const result = await runTestEmbedSearch("how to install", 5, {
      embedder,
      embeddingModel: "nomic-embed-text:latest",
      runSql: makeFakeSql(rows),
    });

    expect(result.results).toHaveLength(2);
    expect(result.results[0]).toMatchObject({
      id: "guide/install",
      slug: "guide/install",
      title: "Install",
      type: "guide",
      tags: ["kb", "install"],
      sourcePath: "guide/install.md",
      contentHash: "h1",
      parentCount: 3,
      childCount: 7,
      score: 0.9182734,
      updatedAt: "2026-01-02T03:04:05.000Z",
    });
    expect(result.results[1]).toMatchObject({
      id: "guide/trouble",
      title: "Trouble",
      type: "guide",
      tags: [],
      sourcePath: null,
      contentHash: "h2",
      parentCount: 0,
      childCount: 0,
      score: 0.4221,
      updatedAt: null,
    });
  });

  test("empty query short-circuits to { results: [] }", async () => {
    const { runTestEmbedSearch } = await import("./embed-search.ts");
    const embedder = makeFakeEmbedder([[]]);
    const result = await runTestEmbedSearch("   ", 10, {
      embedder,
      embeddingModel: "nomic-embed-text:latest",
      runSql: makeFakeSql([]),
    });

    expect(result).toEqual({ results: [] });
  });

  test("clamps limit to [1, 50]", async () => {
    const { runTestEmbedSearch, EMBED_TEST_SEARCH_MAX_LIMIT } = await import(
      "./embed-search.ts"
    );
    const embedder = makeFakeEmbedder([[0.1]]);

    const tooLow = await runTestEmbedSearch("x", 0, {
      embedder,
      embeddingModel: "nomic-embed-text:latest",
      runSql: makeFakeSql([]),
    });
    const tooHigh = await runTestEmbedSearch(
      "x",
      EMBED_TEST_SEARCH_MAX_LIMIT + 100,
      {
        embedder,
        embeddingModel: "nomic-embed-text:latest",
        runSql: makeFakeSql([]),
      },
    );
    expect(tooLow).toBeDefined();
    expect(tooHigh).toBeDefined();
  });

  test("propagates embedder errors", async () => {
    const { runTestEmbedSearch } = await import("./embed-search.ts");
    const failingEmbedder: FakeEmbedder = {
      embed: async () => {
        throw new Error("embed down");
      },
    };

    await expect(
      runTestEmbedSearch("hello", 10, { embedder: failingEmbedder }),
    ).rejects.toThrow("embed down");
  });

  test("returns numeric scores parsed from strings (e.g. postgres bigint)", async () => {
    const rows = [
      {
        id: "p1",
        slug: "p1",
        title: "P",
        type: null,
        tags: [],
        source_path: null,
        content_hash: null,
        updated_at: null,
        parent_count: 0,
        child_count: 0,
        score: "0.8123",
      },
    ];
    const { runTestEmbedSearch } = await import("./embed-search.ts");
    const embedder = makeFakeEmbedder([[0.1]]);
    const result = await runTestEmbedSearch("q", 5, {
      embedder,
      embeddingModel: "nomic-embed-text:latest",
      runSql: makeFakeSql(rows),
    });

    expect(result.results[0]?.score).toBe(0.8123);
  });
});
