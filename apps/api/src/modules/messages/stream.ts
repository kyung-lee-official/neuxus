/**
 * Proxy Anthropic SSE events unchanged except `message_start.message`, which
 * gets the echoed request model and, when enabled, the `neuxus` extension.
 */

import type { JsonObject, NeuxusExtension } from "./types.ts";

type StreamState = { seenStart: boolean };

function isObject(value: unknown): value is JsonObject {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function rewriteEvent(
  event: string,
  extension: NeuxusExtension,
  includeExtension: boolean,
  requestedModel: string,
  state: StreamState,
): string {
  const lines = event.split(/\r?\n/);
  const dataLines = lines
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).replace(/^ /, ""));
  if (dataLines.length === 0) return event;

  let parsed: unknown;
  try {
    parsed = JSON.parse(dataLines.join("\n")) as unknown;
  } catch {
    return event;
  }
  if (
    state.seenStart ||
    !isObject(parsed) ||
    parsed.type !== "message_start" ||
    !isObject(parsed.message)
  ) {
    return event;
  }
  state.seenStart = true;

  const message: JsonObject = {
    ...parsed.message,
    model: requestedModel,
    ...(includeExtension ? { neuxus: extension } : {}),
  };
  const kept = lines.filter((line) => !line.startsWith("data:"));
  kept.push(`data: ${JSON.stringify({ ...parsed, message })}`);
  return kept.join("\n");
}

/** Wrap an Anthropic SSE stream and inject `neuxus` into `message_start`. */
export function neuxusSseStream(
  source: ReadableStream<Uint8Array>,
  extension: NeuxusExtension,
  includeExtension: boolean,
  requestedModel: string,
): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const state: StreamState = { seenStart: false };
  let buffer = "";

  return source.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        buffer += decoder.decode(chunk, { stream: true });
        for (;;) {
          const match = /\r?\n\r?\n/.exec(buffer);
          if (!match || match.index === undefined) break;
          const event = buffer.slice(0, match.index);
          buffer = buffer.slice(match.index + match[0].length);
          controller.enqueue(
            encoder.encode(
              `${rewriteEvent(event, extension, includeExtension, requestedModel, state)}\n\n`,
            ),
          );
        }
      },
      flush(controller) {
        buffer += decoder.decode();
        if (buffer.trim() !== "") {
          controller.enqueue(
            encoder.encode(
              rewriteEvent(
                buffer,
                extension,
                includeExtension,
                requestedModel,
                state,
              ),
            ),
          );
        }
      },
    }),
  );
}
