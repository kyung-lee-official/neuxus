import { afterEach, describe, expect, test } from "bun:test";
import { executeToolUse, toolDefinitions } from "./registry.ts";

const originalKey = process.env.DEEPSEEK_API_KEY;

afterEach(() => {
  if (originalKey === undefined) delete process.env.DEEPSEEK_API_KEY;
  else process.env.DEEPSEEK_API_KEY = originalKey;
});

describe("toolDefinitions", () => {
  test("omits fetch_url when DEEPSEEK_API_KEY is unset", () => {
    delete process.env.DEEPSEEK_API_KEY;
    expect(toolDefinitions()).toEqual([]);
  });

  test("includes fetch_url when DEEPSEEK_API_KEY is set", () => {
    process.env.DEEPSEEK_API_KEY = "test-key";
    expect(toolDefinitions().map((tool) => tool.name)).toContain("fetch_url");
  });
});

describe("executeToolUse", () => {
  test("returns an error result for an unknown tool", async () => {
    const result = await executeToolUse(
      { type: "tool_use", id: "tool-1", name: "missing", input: {} },
      { userId: "lily", sessionId: "session-1" },
    );
    expect(result.is_error).toBe(true);
    expect(result.content).toContain("Unknown tool");
  });

  test("refuses an unavailable tool without calling it", async () => {
    delete process.env.DEEPSEEK_API_KEY;
    const result = await executeToolUse(
      {
        type: "tool_use",
        id: "tool-2",
        name: "fetch_url",
        input: { url: "https://example.com" },
      },
      { userId: "lily", sessionId: "session-1" },
    );
    expect(result.is_error).toBe(true);
    expect(result.content).toContain("Tool is unavailable");
  });
});
