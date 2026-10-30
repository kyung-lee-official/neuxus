/** Registry for chat-owned tools. Add new tools to `TOOLS`. */

import { fetchUrlTool } from "./fetch-url.ts";
import type {
  Tool,
  ToolContext,
  ToolDefinition,
  ToolResultBlock,
  ToolUseBlock,
} from "./types.ts";

const TOOLS: readonly Tool[] = [fetchUrlTool];
const TOOL_BY_NAME = new Map(TOOLS.map((tool) => [tool.definition.name, tool]));

export function toolDefinitions(): ToolDefinition[] {
  return TOOLS.map((tool) => tool.definition);
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

/** Execute one `tool_use` block and return an Anthropic `tool_result`. */
export async function executeToolUse(
  block: ToolUseBlock,
  context: ToolContext,
): Promise<ToolResultBlock> {
  const tool = TOOL_BY_NAME.get(block.name);
  if (!tool) {
    return {
      type: "tool_result",
      tool_use_id: block.id,
      content: `Unknown tool: ${block.name}`,
      is_error: true,
    };
  }
  try {
    return {
      type: "tool_result",
      tool_use_id: block.id,
      content: await tool.execute(block.input, context),
    };
  } catch (error) {
    if (isAbortError(error)) throw error;
    return {
      type: "tool_result",
      tool_use_id: block.id,
      content: errorText(error),
      is_error: true,
    };
  }
}
