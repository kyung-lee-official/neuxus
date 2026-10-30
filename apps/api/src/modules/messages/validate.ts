import { ProtocolError } from "../../shared/protocol.ts";
import type {
  AnthropicMessage,
  JsonObject,
  MessagesHeaders,
  MessagesRequestBody,
} from "./types.ts";

function invalid(message: string): never {
  throw new ProtocolError(
    400,
    "invalid_request_error",
    "invalid_request",
    message,
  );
}

function header(headers: Record<string, unknown>, name: string): string {
  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() !== wanted) continue;
    return typeof value === "string" ? value.trim() : "";
  }
  return "";
}

/** Validate and normalize the neuxus-specific request headers. */
export function messagesHeaders(
  headers: Record<string, unknown>,
): MessagesHeaders {
  const knowledgeBaseId = header(headers, "X-Neuxus-Knowledge-Base");
  if (knowledgeBaseId === "") {
    throw new ProtocolError(
      400,
      "invalid_request_error",
      "missing_knowledge_base",
      "X-Neuxus-Knowledge-Base is required.",
    );
  }
  const anthropicVersion = header(headers, "anthropic-version");
  if (anthropicVersion === "") {
    invalid("anthropic-version is required for POST /v1/messages.");
  }
  const extensions = header(headers, "X-Neuxus-Extensions");
  if (extensions !== "" && extensions !== "sources" && extensions !== "none") {
    invalid('X-Neuxus-Extensions must be "sources" or "none".');
  }
  return {
    knowledgeBaseId,
    extensions: extensions === "none" ? "none" : "sources",
    anthropicVersion,
    anthropicBeta: header(headers, "anthropic-beta"),
  };
}

function isObject(value: unknown): value is JsonObject {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function isTextBlock(
  block: unknown,
): block is JsonObject & { type: "text"; text: string } {
  return (
    isObject(block) && block.type === "text" && typeof block.text === "string"
  );
}

function isToolResultBlock(block: unknown): boolean {
  return isObject(block) && block.type === "tool_result";
}

/** Validate the Anthropic request shape that neuxus reads, not its content. */
export function messagesBody(body: unknown): MessagesRequestBody {
  if (!isObject(body)) invalid("Request body must be a JSON object.");

  const model = body.model;
  if (typeof model !== "string" || model.trim() === "") {
    invalid("model must be a non-empty string.");
  }
  const maxTokens = body.max_tokens;
  if (
    typeof maxTokens !== "number" ||
    !Number.isInteger(maxTokens) ||
    maxTokens <= 0
  ) {
    invalid("max_tokens must be a positive integer.");
  }
  if (body.stream !== undefined && typeof body.stream !== "boolean") {
    invalid("stream must be a boolean.");
  }
  const messages = body.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    invalid("messages must be a non-empty array.");
  }

  const checked: AnthropicMessage[] = messages.map((message, index) => {
    if (!isObject(message)) {
      invalid(`messages[${index}] must be an object.`);
    }
    if (message.role !== "user" && message.role !== "assistant") {
      invalid(`messages[${index}].role must be "user" or "assistant".`);
    }
    const content = message.content;
    if (typeof content !== "string" && !Array.isArray(content)) {
      invalid(`messages[${index}].content must be a string or an array.`);
    }
    if (Array.isArray(content)) {
      for (const [blockIndex, block] of content.entries()) {
        if (!isObject(block) || typeof block.type !== "string") {
          invalid(
            `messages[${index}].content[${blockIndex}] must be a content block.`,
          );
        }
      }
    }
    return {
      ...message,
      role: message.role,
      content: content as string | unknown[],
    };
  });

  return {
    ...body,
    model: model.trim(),
    max_tokens: maxTokens,
    messages: checked,
  };
}

export type HumanTurn = {
  index: number;
  message: AnthropicMessage;
  text: string;
  blocks: unknown[];
};

/**
 * The current human turn is the LAST message, when it is a `user` message with
 * text and no `tool_result`. Earlier user messages are history.
 */
export function humanTurnFrom(messages: AnthropicMessage[]): HumanTurn | null {
  const index = messages.length - 1;
  const message = messages[index];
  if (message?.role !== "user") return null;

  const blocks =
    typeof message.content === "string"
      ? [{ type: "text" as const, text: message.content }]
      : message.content;
  if (blocks.some(isToolResultBlock)) return null;

  const texts = blocks.filter(isTextBlock).map((block) => block.text);
  if (texts.length === 0) return null;

  return {
    index,
    message,
    text: texts.join("\n\n"),
    blocks,
  };
}

/** Prepend the knowledge block to the selected human turn only. */
export function messagesWithKnowledge(
  messages: AnthropicMessage[],
  turn: HumanTurn,
  block: string,
): AnthropicMessage[] {
  const injected = { type: "text" as const, text: block };
  const content = [injected, ...turn.blocks];
  return messages.map((message, index) =>
    index === turn.index ? { ...message, content } : message,
  );
}
