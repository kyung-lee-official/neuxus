import { afterEach, describe, expect, test } from "bun:test";
import {
  resetAgentSettingsForTests,
  setAgentSettingsForTests,
} from "../agent-settings/service.ts";
import { executeToolUse, questionFromInput, toolDefinitions } from "./index.ts";

afterEach(() => {
  resetAgentSettingsForTests();
});

describe("questionFromInput", () => {
  test("normalizes a question with options", () => {
    setAgentSettingsForTests({ deepseekApiKey: "" });
    const question = questionFromInput({
      question: " Which target? ",
      header: " Target ",
      options: [{ label: "Dev", description: "Local" }, { label: "Prod" }],
    });
    expect(question.question).toBe("Which target?");
    expect(question.header).toBe("Target");
    expect(question.options).toEqual([
      { label: "Dev", description: "Local" },
      { label: "Prod" },
    ]);
    expect(question.multiple).toBe(false);
    expect(question.allowCustom).toBe(true);
  });

  test("rejects a custom answer when options are required", () => {
    expect(() =>
      questionFromInput({
        question: "Pick one",
        allowCustom: false,
      }),
    ).toThrow("options are required");
  });

  test("rejects more than six options", () => {
    expect(() =>
      questionFromInput({
        question: "Pick one",
        options: Array.from({ length: 7 }, (_, index) => ({
          label: String(index),
        })),
      }),
    ).toThrow("1 to 6");
  });
});

describe("question tool registration", () => {
  test("is hidden from synchronous tool definitions", () => {
    setAgentSettingsForTests({ deepseekApiKey: "" });
    expect(toolDefinitions().map((tool) => tool.name)).not.toContain(
      "question",
    );
  });

  test("is present in durable tool definitions", () => {
    setAgentSettingsForTests({ deepseekApiKey: "" });
    expect(
      toolDefinitions({ durable: true }).map((tool) => tool.name),
    ).toContain("question");
  });

  test("cannot execute outside the durable run loop", async () => {
    const result = await executeToolUse(
      {
        type: "tool_use",
        id: "q1",
        name: "question",
        input: { question: "Target?" },
      },
      { userId: "lily", sessionId: "session-1" },
    );
    expect(result.is_error).toBe(true);
    expect(result.content).toContain("requires durable execution");
  });
});
