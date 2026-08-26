import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { getLogTransport, setLogTransport } from "../log/index.ts";
import { PostgresTransport } from "../log/sinks/postgres.ts";
import { fitPromptToWindow, maxPromptCharacters } from "./budget.ts";
import {
  assertSynthesisBudget,
  resolveSynthesisSettings,
  SYNTHESIS_DEFAULTS,
} from "./defaults.ts";
import { createMinimaxSynthesizer } from "./minimax.ts";
import { createSynthesizer } from "./provider.ts";

describe("resolveSynthesisSettings", () => {
  test("uses MiniMax reset defaults when the row is missing", () => {
    expect(resolveSynthesisSettings(null)).toEqual({
      provider: SYNTHESIS_DEFAULTS.provider,
      synthesisModel: SYNTHESIS_DEFAULTS.synthesisModel,
      baseUrl: SYNTHESIS_DEFAULTS.baseUrl,
      apiKey: null,
      maxTokens: SYNTHESIS_DEFAULTS.maxTokens,
      contextWindowTokens: SYNTHESIS_DEFAULTS.contextWindowTokens,
    });
  });

  test("uses the stored api key when the row has one", () => {
    expect(
      resolveSynthesisSettings({
        synthesisModel: "MiniMax-M3",
        apiKey: "stored-key",
      }).apiKey,
    ).toBe("stored-key");
  });

  test("does not invent a window for an unknown model", () => {
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

  beforeEach(() => {
    setLogTransport(new PostgresTransport());
    getLogTransport().drain(10_000);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    setLogTransport(new PostgresTransport());
    getLogTransport().drain(10_000);
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
    const body = calls[0]?.body as {
      model: string;
      system: string;
      messages: Array<{ role: string; content: Array<{ text: string }> }>;
    };
    expect(body.model).toBe("MiniMax-M3");
    expect(body.system).toMatch(/Answer ONLY the user's current question/);
    expect(body.system).toMatch(/do NOT continue or repeat prior topics/);
    expect(body.messages[0]?.content[0]?.text).toBe("q");
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

describe("createSynthesizer logging wrapper", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    setLogTransport(new PostgresTransport());
    getLogTransport().drain(10_000);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    setLogTransport(new PostgresTransport());
    getLogTransport().drain(10_000);
  });

  test("logs the raw prompt and response on success", async () => {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          content: [{ type: "text", text: "the answer" }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      )) as unknown as typeof fetch;

    const synthesizer = createSynthesizer({
      ...resolveSynthesisSettings({ apiKey: "k" }),
    });
    await expect(synthesizer.synthesize("the prompt")).resolves.toBe(
      "the answer",
    );

    const drained = getLogTransport().drain(10);
    expect(drained).toHaveLength(1);
    const record = drained[0]!;
    expect(record.level).toBe("info");
    expect(record.msg).toBe("synthesis ok");
    expect(record.name).toBe("synthesis");
    expect(record.meta.provider).toBe("minimax");
    expect(record.meta.model).toBe(SYNTHESIS_DEFAULTS.synthesisModel);
    expect(record.meta.maxTokens).toBe(SYNTHESIS_DEFAULTS.maxTokens);
    expect(record.meta.promptChars).toBe("the prompt".length);
    expect(record.meta.prompt).toBe("the prompt");
    expect(record.meta.response).toBe("the answer");
    expect(record.meta.status).toBe("ok");
    expect(typeof record.meta.latencyMs).toBe("number");
  });

  test("logs the raw prompt and error message on failure", async () => {
    globalThis.fetch = (async () =>
      new Response("nope", { status: 401 })) as unknown as typeof fetch;

    const synthesizer = createSynthesizer({
      ...resolveSynthesisSettings({ apiKey: "k" }),
    });
    await expect(synthesizer.synthesize("the prompt")).rejects.toThrow(/401/);

    const drained = getLogTransport().drain(10);
    expect(drained).toHaveLength(1);
    const record = drained[0]!;
    expect(record.level).toBe("error");
    expect(record.msg).toBe("synthesis error");
    expect(record.name).toBe("synthesis");
    expect(record.meta.prompt).toBe("the prompt");
    expect(record.meta.status).toBe("error");
    expect(record.meta.error).toMatch(/401/);
    expect(record.meta.response).toBeUndefined();
  });
});
