/**
 * Chat-owned agent loop. The model may request tools; this module executes
 * them and sends `tool_result` blocks back until the model returns a final
 * text answer.
 */

import { AgentSettings } from "../agent-settings/service.ts";
import {
  executeToolUse,
  type JsonObject,
  type QuestionInput,
  questionFromInput,
  type ToolUseBlock,
  toolDefinitions,
} from "../tools/index.ts";
import {
  askNeuxus,
  NeuxusClientError,
  type NeuxusContentBlock,
  streamNeuxus,
} from "./core-client.ts";

const TOOL_PREVIEW_CHARS = 500;

export class QuestionPause extends Error {
  constructor() {
    super("Agent run is waiting for a question answer");
    this.name = "QuestionPause";
  }
}

export class RunCancelledError extends Error {
  constructor() {
    super("Agent run cancelled");
    this.name = "RunCancelledError";
  }
}

export type AgentQuestionRequest = QuestionInput & {
  toolUseId: string;
  assistantContent: NeuxusContentBlock[];
  messages: unknown[];
  iteration: number;
};

export type AgentQuestionOutcome =
  | { kind: "answer"; answer: string }
  | { kind: "pause" };

export type AgentToolEvent =
  | {
      type: "tool_call";
      id: string;
      name: string;
      input: JsonObject;
    }
  | {
      type: "tool_result";
      id: string;
      name: string;
      isError: boolean;
      preview: string;
    };

export type AgentResult = {
  answer: string;
  content: NeuxusContentBlock[];
};

function isObject(value: unknown): value is JsonObject {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function toolUsesFrom(content: NeuxusContentBlock[]): ToolUseBlock[] {
  const uses: ToolUseBlock[] = [];
  for (const block of content) {
    if (
      block.type === "tool_use" &&
      typeof block.id === "string" &&
      typeof block.name === "string" &&
      isObject(block.input)
    ) {
      uses.push({
        type: "tool_use",
        id: block.id,
        name: block.name,
        input: block.input,
      });
    }
  }
  return uses;
}

/** Run model → tool → model until there are no more tool calls. */
export async function runAgent(input: {
  knowledgeBaseId: string;
  requestBody: Record<string, unknown>;
  userId: string;
  sessionId: string;
  stream: boolean;
  startIteration?: number;
  enableQuestion?: boolean;
  signal?: AbortSignal;
  shouldStop?: () => Promise<boolean> | boolean;
  onText?: (text: string) => void;
  onTool?: (event: AgentToolEvent) => void;
  onQuestion?: (
    request: AgentQuestionRequest,
  ) => Promise<AgentQuestionOutcome> | AgentQuestionOutcome;
  onCheckpoint?: (state: {
    messages: unknown[];
    iteration: number;
  }) => Promise<void> | void;
}): Promise<AgentResult> {
  const tools = toolDefinitions({ durable: input.enableQuestion === true });
  const maxIterations = AgentSettings.current().maxToolIterations;
  let messages = Array.isArray(input.requestBody.messages)
    ? input.requestBody.messages
    : [];

  const appendToolResults = async (
    assistantContent: NeuxusContentBlock[],
    results: Array<Record<string, unknown>>,
    iteration: number,
  ) => {
    messages = [
      ...messages,
      { role: "assistant", content: assistantContent },
      { role: "user", content: results },
    ];
    await input.onCheckpoint?.({
      messages,
      iteration: iteration + 1,
    });
  };

  for (
    let iteration = input.startIteration ?? 0;
    iteration < maxIterations;
    iteration++
  ) {
    if (await input.shouldStop?.()) throw new RunCancelledError();

    const body: Record<string, unknown> = {
      ...input.requestBody,
      messages,
      ...(tools.length > 0 ? { tools } : {}),
    };
    const response =
      input.stream && input.onText
        ? await streamNeuxus({
            knowledgeBaseId: input.knowledgeBaseId,
            body,
            signal: input.signal,
            onText: input.onText,
          })
        : await askNeuxus({
            knowledgeBaseId: input.knowledgeBaseId,
            body,
            signal: input.signal,
          });

    const toolUses = toolUsesFrom(response.content);
    if (toolUses.length === 0) {
      return { answer: response.answer, content: response.content };
    }

    if (await input.shouldStop?.()) throw new RunCancelledError();

    for (const use of toolUses) {
      input.onTool?.({
        type: "tool_call",
        id: use.id,
        name: use.name,
        input: use.input,
      });
    }

    const questionUses = toolUses.filter((use) => use.name === "question");
    if (questionUses.length > 0) {
      const questionUse = questionUses[0];
      if (!questionUse) continue;
      if (toolUses.length > 1) {
        const results = await Promise.all(
          toolUses.map((use) =>
            use.name === "question"
              ? Promise.resolve({
                  type: "tool_result",
                  tool_use_id: use.id,
                  content: "question must be called alone",
                  is_error: true,
                })
              : executeToolUse(use, {
                  userId: input.userId,
                  sessionId: input.sessionId,
                  signal: input.signal,
                }),
          ),
        );
        for (const [index, result] of results.entries()) {
          const use = toolUses[index];
          if (!use) continue;
          input.onTool?.({
            type: "tool_result",
            id: use.id,
            name: use.name,
            isError: result.is_error === true,
            preview: result.content.slice(0, TOOL_PREVIEW_CHARS),
          });
        }
        await appendToolResults(response.content, results, iteration);
        continue;
      }

      let question: QuestionInput;
      try {
        question = questionFromInput(questionUse.input);
      } catch (error) {
        const result = {
          type: "tool_result" as const,
          tool_use_id: questionUse.id,
          content: error instanceof Error ? error.message : String(error),
          is_error: true,
        };
        input.onTool?.({
          type: "tool_result",
          id: questionUse.id,
          name: questionUse.name,
          isError: true,
          preview: result.content,
        });
        await appendToolResults(response.content, [result], iteration);
        continue;
      }

      if (!input.onQuestion) {
        const result = {
          type: "tool_result" as const,
          tool_use_id: questionUse.id,
          content: "question is unavailable in this execution mode",
          is_error: true,
        };
        input.onTool?.({
          type: "tool_result",
          id: questionUse.id,
          name: questionUse.name,
          isError: true,
          preview: result.content,
        });
        await appendToolResults(response.content, [result], iteration);
        continue;
      }

      const outcome = await input.onQuestion({
        ...question,
        toolUseId: questionUse.id,
        assistantContent: response.content,
        messages,
        iteration,
      });
      if (outcome.kind === "pause") throw new QuestionPause();

      const result = {
        type: "tool_result" as const,
        tool_use_id: questionUse.id,
        content: `User answer:\n${outcome.answer}`,
      };
      input.onTool?.({
        type: "tool_result",
        id: questionUse.id,
        name: questionUse.name,
        isError: false,
        preview: outcome.answer.slice(0, TOOL_PREVIEW_CHARS),
      });
      await appendToolResults(response.content, [result], iteration);
      continue;
    }

    const results = await Promise.all(
      toolUses.map((use) =>
        executeToolUse(use, {
          userId: input.userId,
          sessionId: input.sessionId,
          signal: input.signal,
        }),
      ),
    );
    for (const [index, result] of results.entries()) {
      const use = toolUses[index];
      if (!use) continue;
      input.onTool?.({
        type: "tool_result",
        id: use.id,
        name: use.name,
        isError: result.is_error === true,
        preview: result.content.slice(0, TOOL_PREVIEW_CHARS),
      });
    }

    await appendToolResults(response.content, results, iteration);
  }

  throw new NeuxusClientError(
    502,
    `Tool loop exceeded ${maxIterations} iterations`,
    false,
  );
}
