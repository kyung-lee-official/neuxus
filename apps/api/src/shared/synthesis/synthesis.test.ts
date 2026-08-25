import { afterEach, describe, expect, test } from "bun:test";
import { fitPromptToWindow, maxPromptCharacters } from "./budget.ts";
import {
  assertSynthesisBudget,
  resolveSynthesisSettings,
  SYNTHESIS_DEFAULTS,
} from "./defaults.ts";
import { createMinimaxSynthesizer } from "./minimax.ts";
import { createSynthesizer } from "./provider.ts";

describe("resolveSynthesisSettings", () => {
  const originalApiKey = process.env.MINIMAX_API_KEY;

  afterEach(() => {
    if (originalApiKey === undefined) delete process.env.MINIMAX_API_KEY;
    else process.env.MINIMAX_API_KEY = originalApiKey;
  });

  test("uses MiniMax reset defaults when the row is missing", () => {
    delete process.env.MINIMAX_API_KEY;
    expect(resolveSynthesisSettings(null)).toEqual({
      provider: SYNTHESIS_DEFAULTS.provider,
      synthesisModel: SYNTHESIS_DEFAULTS.synthesisModel,
      baseUrl: SYNTHESIS_DEFAULTS.baseUrl,
      apiKey: null,
      maxTokens: SYNTHESIS_DEFAULTS.maxTokens,
      contextWindowTokens: SYNTHESIS_DEFAULTS.contextWindowTokens,
    });
  });

  test("falls back to MINIMAX_API_KEY env var when the row omits the key", () => {
    delete process.env.MINIMAX_API_KEY;
    expect(
      resolveSynthesisSettings({ synthesisModel: "MiniMax-M3" }).apiKey,
    ).toBeNull();

    process.env.MINIMAX_API_KEY = "env-key";
    expect(
      resolveSynthesisSettings({ synthesisModel: "MiniMax-M3" }).apiKey,
    ).toBe("env-key");
  });

  test("prefers a stored row key over the env var", () => {
    process.env.MINIMAX_API_KEY = "env-key";
    expect(
      resolveSynthesisSettings({
        synthesisModel: "MiniMax-M3",
        apiKey: "stored-key",
      }).apiKey,
    ).toBe("stored-key");
  });

  test("does not invent a window for an unknown model", () => {
    delete process.env.MINIMAX_API_KEY;
    const resolved = resolveSynthesisSettings({
      synthesisModel: "other-llm",
      contextWindowTokens: null,
    });
    expect(resolved.synthesisModel).toBe("other-llm");
    expect(resolved.contextWindowTokens).toBe(0);
    expect(() => assertSynthesisBudget(resolved)).toThrow(
      /context_window_tokens is required/,
    );
  });

  test("keeps a stored window for a custom model", () => {
    delete process.env.MINIMAX_API_KEY;
    expect(
      resolveSynthesisSettings({
        provider: "minimax",
        synthesisModel: "other-llm",
        contextWindowTokens: 32_000,
        maxTokens: 1024,
      }).contextWindowTokens,
    ).toBe(32_000);
  });
});

describe("assertSynthesisBudget", () => {
  test("rejects max_tokens that fill the whole window", () => {
    expect(() =>
      assertSynthesisBudget({
        ...resolveSynthesisSettings(null),
        contextWindowTokens: 100,
        maxTokens: 100,
      }),
    ).toThrow(/does not fit/);
  });
});

describe("fitPromptToWindow", () => {
  test("keeps the end of an oversized prompt", () => {
    const settings = { contextWindowTokens: 20, maxTokens: 10 };
    expect(maxPromptCharacters(settings)).toBe(40);
    const prompt = `${"a".repeat(50)}QUESTION`;
    const fitted = fitPromptToWindow(prompt, settings);
    expect(fitted.endsWith("[context truncated]")).toBe(true);
    expect(fitted).toContain("QUESTION");
  });
});

describe("createSynthesizer", () => {
  test("rejects an unknown provider", () => {
    expect(() =>
      createSynthesizer({
        ...resolveSynthesisSettings({ apiKey: "k" }),
        provider: "openai",
      }),
    ).toThrow(/Unsupported synthesis provider/);
  });
});

describe("createMinimaxSynthesizer", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("POSTs Messages API without echoing the key on error", async () => {
    const calls: Array<{ url: string; body: unknown; headers: Headers }> = [];
    globalThis.fetch = (async (
      input: string | URL | Request,
      init?: RequestInit,
    ) => {
      calls.push({
        url: String(input),
        body: JSON.parse(String(init?.body)),
        headers: new Headers(init?.headers),
      });
      return new Response(
        JSON.stringify({
          content: [{ type: "text", text: "hello" }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as unknown as typeof fetch;

    const synthesizer = createMinimaxSynthesizer({
      baseUrl: SYNTHESIS_DEFAULTS.baseUrl,
      apiKey: "secret",
      synthesisModel: "MiniMax-M3",
      maxTokens: 4096,
    });
    await expect(synthesizer.synthesize("q")).resolves.toBe("hello");
    expect(calls[0]?.url).toBe(
      "https://api.minimaxi.com/anthropic/v1/messages",
    );
    expect(calls[0]?.headers.get("x-api-key")).toBe("secret");
    const body = calls[0]?.body as { model: string };
    expect(body.model).toBe("MiniMax-M3");
  });

  test("throws on HTTP error without the response body", async () => {
    globalThis.fetch = (async () =>
      new Response("nope", { status: 401 })) as unknown as typeof fetch;
    const synthesizer = createMinimaxSynthesizer({
      baseUrl: SYNTHESIS_DEFAULTS.baseUrl,
      apiKey: "secret",
      synthesisModel: "MiniMax-M3",
      maxTokens: 4096,
    });
    await expect(synthesizer.synthesize("q")).rejects.toThrow(
      "MiniMax messages failed (401)",
    );
  });
});
