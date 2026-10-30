/**
 * Chat-owned agent loop. The model may request tools; this module executes
 * them and sends `tool_result` blocks back until the model returns a final
 * text answer.
 */

import { AgentSettings } from "../agent-settings/service.ts";
import {
  executeToolUse,
  type JsonObject,
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
  signal?: AbortSignal;
  onText?: (text: string) => void;
  onTool?: (event: AgentToolEvent) => void;
  onCheckpoint?: (state: {
    messages: unknown[];
    iteration: number;
  }) => Promise<void> | void;
}): Promise<AgentResult> {
  const tools = toolDefinitions();
  const maxIterations = AgentSettings.current().maxToolIterations;
  let messages = Array.isArray(input.requestBody.messages)
    ? input.requestBody.messages
    : [];

  for (
    let iteration = input.startIteration ?? 0;
    iteration < maxIterations;
    iteration++
  ) {
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

    for (const use of toolUses) {
      input.onTool?.({
        type: "tool_call",
        id: use.id,
        name: use.name,
        input: use.input,
      });
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

    messages = [
      ...messages,
      { role: "assistant", content: response.content },
      { role: "user", content: results },
    ];
    await input.onCheckpoint?.({
      messages,
      iteration: iteration + 1,
    });
  }

  throw new NeuxusClientError(
    502,
    `Tool loop exceeded ${maxIterations} iterations`,
    false,
  );
}
