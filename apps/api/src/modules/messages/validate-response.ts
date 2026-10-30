import { ProtocolError } from "../../shared/protocol.ts";
import type { JsonObject, MessageResponse } from "./types.ts";

const STOP_REASONS = new Set([
  "end_turn",
  "max_tokens",
  "stop_sequence",
  "tool_use",
  "pause_turn",
  "refusal",
]);

function isObject(value: unknown): value is JsonObject {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function malformed(): never {
  throw new ProtocolError(
    502,
    "api_error",
    "non_anthropic_upstream",
    "Upstream did not return an Anthropic message.",
  );
}

/** Validate the Anthropic envelope, then echo the client's requested model. */
export function anthropicMessageResponse(
  value: unknown,
  requestedModel: string,
): MessageResponse {
  if (!isObject(value)) malformed();
  if (value.type !== "message" || value.role !== "assistant") malformed();
  if (typeof value.id !== "string" || value.id === "") malformed();
  if (!Array.isArray(value.content)) malformed();
  for (const block of value.content) {
    if (!isObject(block) || typeof block.type !== "string") malformed();
  }
  if (
    typeof value.stop_reason !== "string" ||
    !STOP_REASONS.has(value.stop_reason)
  ) {
    malformed();
  }
  if (value.stop_sequence !== null && typeof value.stop_sequence !== "string") {
    malformed();
  }
  if (!isObject(value.usage)) malformed();

  return { ...value, model: requestedModel };
}
