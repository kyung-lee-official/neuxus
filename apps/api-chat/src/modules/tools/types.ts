/** Chat-owned tools exposed to the model through Anthropic's tool interface. */

export type JsonObject = Record<string, unknown>;

export type ToolDefinition = {
  name: string;
  description: string;
  input_schema: JsonObject;
};

export type ToolUseBlock = {
  type: "tool_use";
  id: string;
  name: string;
  input: JsonObject;
};

export type ToolResultBlock = {
  type: "tool_result";
  tool_use_id: string;
  content: string;
  is_error?: boolean;
};

export type ToolContext = {
  userId: string;
  sessionId: string;
  signal?: AbortSignal;
};

export type Tool = {
  definition: ToolDefinition;
  /** Tools without an `available` callback are always available. */
  available?: () => boolean;
  execute(input: JsonObject, context: ToolContext): Promise<string>;
};
