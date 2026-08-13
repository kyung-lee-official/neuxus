import { afterEach, describe, expect, test } from "bun:test";
import { embedChildRows, pgvectorLiteral } from "./children.ts";
import { EMBED_DEFAULTS, resolveEmbedSettings } from "./defaults.ts";
import { createOllamaEmbedder } from "./ollama.ts";
import { createEmbedder } from "./provider.ts";
import type { Embedder } from "./types.ts";

describe("resolveEmbedSettings", () => {
  test("uses app defaults when the row is missing", () => {
    expect(resolveEmbedSettings(null)).toEqual({
      embeddingModel: EMBED_DEFAULTS.embeddingModel,
      provider: EMBED_DEFAULTS.provider,
      host: EMBED_DEFAULTS.host,
      port: EMBED_DEFAULTS.port,
      apiKey: null,
    });
  });

  test("fills null and blank columns from defaults", () => {
    expect(
      resolveEmbedSettings({
        embeddingModel: "  ",
        provider: null,
        host: "ollama.local",
        port: 0,
        apiKey: "",
      }),
    ).toEqual({
      embeddingModel: EMBED_DEFAULTS.embeddingModel,
      provider: EMBED_DEFAULTS.provider,
      host: "ollama.local",
      port: EMBED_DEFAULTS.port,
      apiKey: null,
    });
  });

  test("keeps stored model and connection fields", () => {
    expect(
      resolveEmbedSettings({
        embeddingModel: "nomic-embed-text:latest",
        provider: "ollama",
        host: "10.0.0.2",
        port: 11435,
        apiKey: "secret",
      }),
    ).toEqual({
      embeddingModel: "nomic-embed-text:latest",
      provider: "ollama",
      host: "10.0.0.2",
      port: 11435,
      apiKey: "secret",
    });
  });
});

describe("createEmbedder", () => {
  test("rejects an unknown provider", () => {
    expect(() =>
      createEmbedder({
        ...resolveEmbedSettings(null),
        provider: "openai",
      }),
    ).toThrow(/Unsupported embed provider/);
  });
});

describe("pgvectorLiteral", () => {
  test("formats finite numbers", () => {
    expect(pgvectorLiteral([0.1, -2])).toBe("[0.1,-2]");
  });

  test("rejects empty or non-finite values", () => {
    expect(() => pgvectorLiteral([])).toThrow(/invalid embedding vector/);
    expect(() => pgvectorLiteral([Number.NaN])).toThrow(
      /invalid embedding vector/,
    );
  });
});

describe("createOllamaEmbedder", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("POSTs /api/embed and returns embeddings", async () => {
    const calls: Array<{ url: string; body: unknown; headers: Headers }> = [];
    globalThis.fetch = (async (
      input: string | URL | Request,
      init?: RequestInit,
    ) => {
      const url = String(input);
      calls.push({
        url,
        body: JSON.parse(String(init?.body)),
        headers: new Headers(init?.headers),
      });
      return new Response(JSON.stringify({ embeddings: [[0.25, 0.5]] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as unknown as typeof fetch;

    const embedder = createOllamaEmbedder({
      host: "127.0.0.1",
      port: 11434,
      apiKey: "k",
      embeddingModel: "nomic-embed-text:latest",
    });
    const vectors = await embedder.embed(["hello"]);

    expect(vectors).toEqual([[0.25, 0.5]]);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("http://127.0.0.1:11434/api/embed");
    expect(calls[0]?.body).toEqual({
      model: "nomic-embed-text:latest",
      input: "hello",
    });
    expect(calls[0]?.headers.get("Authorization")).toBe("Bearer k");
  });

  test("throws on a non-OK response without echoing secrets", async () => {
    globalThis.fetch = (async () =>
      new Response("nope", { status: 413 })) as unknown as typeof fetch;
    const embedder = createOllamaEmbedder({
      host: "127.0.0.1",
      port: 11434,
      apiKey: "k",
      embeddingModel: "nomic-embed-text:latest",
    });
    await expect(embedder.embed(["too long"])).rejects.toThrow(
      "Ollama embed failed (413)",
    );
  });
});

describe("embedChildRows", () => {
  test("writes vectors; skips empty text and provider failures", async () => {
    const written: Array<{ id: string; vector: number[] }> = [];
    const embedder: Embedder = {
      async embed(texts) {
        if (texts[0] === "fail") throw new Error("limit");
        return [[1, 0, 0]];
      },
    };

    const result = await embedChildRows(
      [
        { id: "a", text: "ok" },
        { id: "b", text: "" },
        { id: "c", text: "fail" },
      ],
      {
        embedder,
        writeVector: async (id, vector) => {
          written.push({ id, vector });
        },
      },
    );

    expect(result).toEqual({ embedded: 1, skipped: 2 });
    expect(written).toEqual([{ id: "a", vector: [1, 0, 0] }]);
  });
});
