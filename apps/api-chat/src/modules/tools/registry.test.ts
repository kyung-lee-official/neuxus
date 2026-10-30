import { afterEach, describe, expect, test } from "bun:test";
import {
  resetAgentSettingsForTests,
  setAgentSettingsForTests,
} from "../agent-settings/service.ts";
import { executeToolUse, toolDefinitions } from "./registry.ts";

afterEach(() => {
  resetAgentSettingsForTests();
});

describe("toolDefinitions", () => {
  test("omits fetch_url when no DeepSeek key is configured", () => {
    setAgentSettingsForTests({ deepseekApiKey: "" });
    expect(toolDefinitions()).toEqual([]);
  });

  test("includes fetch_url when a DeepSeek key is configured", () => {
    setAgentSettingsForTests({ deepseekApiKey: "test-key" });
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
    setAgentSettingsForTests({ deepseekApiKey: "" });
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
