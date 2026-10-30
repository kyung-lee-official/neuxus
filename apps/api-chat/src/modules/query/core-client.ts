/**
 * Chat adapter for the stateless neuxus `/v1/messages` endpoint. The chat app
 * owns users, sessions, and memory; neuxus owns KB enrichment.
 */

import { neuxusApiUrl, neuxusServiceToken } from "../../shared/config.ts";

export class NeuxusClientError extends Error {
  readonly status: number;
  readonly retryable: boolean;

  constructor(
    status: number,
    message: string,
    retryable = status === 429 || status >= 500,
  ) {
    super(message);
    this.name = "NeuxusClientError";
    this.status = status;
    this.retryable = retryable;
  }
}

type ContentBlock = { type?: unknown; text?: unknown };

export type NeuxusContentBlock = Record<string, unknown>;

function isObject(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function errorMessage(value: unknown, fallback: string): string {
  if (!isObject(value)) return fallback;
  const error = value.error;
  if (typeof error === "string") return error;
  if (isObject(error) && typeof error.message === "string") {
    return error.message;
  }
  return fallback;
}

function contentFromMessage(value: unknown): NeuxusContentBlock[] {
  if (!isObject(value) || !Array.isArray(value.content)) {
    throw new NeuxusClientError(
      502,
      "neuxus returned a response without message content",
    );
  }
  const content: NeuxusContentBlock[] = [];
  for (const block of value.content) {
    if (!isObject(block) || typeof block.type !== "string") {
      throw new NeuxusClientError(
        502,
        "neuxus returned an invalid content block",
      );
    }
    content.push(block);
  }
  return content;
}

function textFromBlocks(content: NeuxusContentBlock[]): string {
  return content
    .filter(
      (block): block is ContentBlock & { type: "text"; text: string } =>
        block.type === "text" && typeof block.text === "string",
    )
    .map((block) => block.text.trim())
    .filter((text) => text !== "")
    .join("\n\n");
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === "AbortError"
    : error instanceof Error && error.name === "AbortError";
}

export type NeuxusAnswer = {
  answer: string;
  requestId: string | null;
  content: NeuxusContentBlock[];
  stopReason: string | null;
};

export type CoreKnowledgeBase = {
  id: string;
  name: string;
  writable: boolean;
  createdAt: string | null;
};

/** List knowledge bases through the core service token. */
export async function listCoreKnowledgeBases(): Promise<CoreKnowledgeBase[]> {
  const token = neuxusServiceToken();
  if (token === "") {
    throw new NeuxusClientError(
      503,
      "NEUXUS_SERVICE_TOKEN is not configured for the chat app",
    );
  }

  let res: Response;
  try {
    res = await fetch(`${neuxusApiUrl()}/knowledge-bases`, {
      headers: { "x-api-key": token },
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new NeuxusClientError(502, "Could not reach the neuxus API");
  }

  const raw = await res.text();
  let data: unknown = null;
  try {
    data = raw === "" ? null : (JSON.parse(raw) as unknown);
  } catch {
    throw new NeuxusClientError(502, "neuxus returned non-JSON");
  }
  if (!res.ok) {
    throw new NeuxusClientError(
      res.status,
      errorMessage(data, `neuxus request failed with status ${res.status}`),
    );
  }
  if (!isObject(data) || !Array.isArray(data.knowledgeBases)) {
    throw new NeuxusClientError(502, "neuxus returned an invalid KB list");
  }
  const knowledgeBases: CoreKnowledgeBase[] = [];
  for (const row of data.knowledgeBases) {
    if (
      !isObject(row) ||
      typeof row.id !== "string" ||
      typeof row.name !== "string" ||
      typeof row.writable !== "boolean"
    ) {
      continue;
    }
    knowledgeBases.push({
      id: row.id,
      name: row.name,
      writable: row.writable,
      createdAt: typeof row.createdAt === "string" ? row.createdAt : null,
    });
  }
  return knowledgeBases;
}

/** Send one enriched Anthropic Messages request and extract the text answer. */
export async function askNeuxus(input: {
  knowledgeBaseId: string;
  body: Record<string, unknown>;
  signal?: AbortSignal;
}): Promise<NeuxusAnswer> {
  const token = neuxusServiceToken();
  if (token === "") {
    throw new NeuxusClientError(
      503,
      "NEUXUS_SERVICE_TOKEN is not configured for the chat app",
    );
  }

  let res: Response;
  try {
    res = await fetch(`${neuxusApiUrl()}/v1/messages`, {
      method: "POST",
      headers: {
        "x-api-key": token,
        "content-type": "application/json",
        "anthropic-version": "2023-06-01",
        "X-Neuxus-Knowledge-Base": input.knowledgeBaseId,
      },
      body: JSON.stringify(input.body),
      signal: input.signal ?? AbortSignal.timeout(120_000),
    });
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw new NeuxusClientError(502, "Could not reach the neuxus API");
  }

  const raw = await res.text();
  let data: unknown = null;
  try {
    data = raw === "" ? null : (JSON.parse(raw) as unknown);
  } catch {
    throw new NeuxusClientError(502, "neuxus returned non-JSON");
  }

  if (!res.ok) {
    throw new NeuxusClientError(
      res.status,
      errorMessage(data, `neuxus request failed with status ${res.status}`),
    );
  }

  const content = contentFromMessage(data);
  const stopReason =
    isObject(data) && typeof data.stop_reason === "string"
      ? data.stop_reason
      : null;
  return {
    answer: textFromBlocks(content),
    requestId: res.headers.get("x-request-id"),
    content,
    stopReason,
  };
}

function sseData(block: string): string | null {
  const lines = block
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).replace(/^ /, ""));
  return lines.length === 0 ? null : lines.join("\n");
}

/**
 * Forward one enriched Anthropic SSE response and report text deltas as they
 * arrive. Returns the complete answer after the stream closes.
 */
export async function streamNeuxus(input: {
  knowledgeBaseId: string;
  body: Record<string, unknown>;
  signal?: AbortSignal;
  onText: (text: string) => void;
}): Promise<NeuxusAnswer> {
  const token = neuxusServiceToken();
  if (token === "") {
    throw new NeuxusClientError(
      503,
      "NEUXUS_SERVICE_TOKEN is not configured for the chat app",
    );
  }

  let res: Response;
  try {
    res = await fetch(`${neuxusApiUrl()}/v1/messages`, {
      method: "POST",
      headers: {
        "x-api-key": token,
        "content-type": "application/json",
        "anthropic-version": "2023-06-01",
        "X-Neuxus-Knowledge-Base": input.knowledgeBaseId,
      },
      body: JSON.stringify({ ...input.body, stream: true }),
      signal: input.signal,
    });
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw new NeuxusClientError(502, "Could not reach the neuxus API");
  }

  if (!res.ok) {
    const raw = await res.text();
    let data: unknown = null;
    try {
      data = raw === "" ? null : (JSON.parse(raw) as unknown);
    } catch {
      throw new NeuxusClientError(502, "neuxus returned non-JSON");
    }
    throw new NeuxusClientError(
      res.status,
      errorMessage(data, `neuxus request failed with status ${res.status}`),
    );
  }
  if (!res.body) {
    throw new NeuxusClientError(502, "neuxus returned no event stream");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let stopReason: string | null = null;
  const blocks = new Map<
    number,
    { block: NeuxusContentBlock; partialJson: string }
  >();

  const finalizeToolInput = (state: {
    block: NeuxusContentBlock;
    partialJson: string;
  }) => {
    if (state.block.type !== "tool_use" || state.partialJson.trim() === "") {
      return;
    }
    let input: unknown;
    try {
      input = JSON.parse(state.partialJson) as unknown;
    } catch {
      throw new NeuxusClientError(
        502,
        "neuxus returned malformed tool input",
        false,
      );
    }
    if (!isObject(input)) {
      throw new NeuxusClientError(
        502,
        "neuxus returned malformed tool input",
        false,
      );
    }
    state.block.input = input;
    state.partialJson = "";
  };

  const consume = (block: string) => {
    const data = sseData(block);
    if (data === null) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(data) as unknown;
    } catch {
      return;
    }
    if (!isObject(parsed) || typeof parsed.type !== "string") return;
    if (parsed.type === "error") {
      throw new NeuxusClientError(
        502,
        errorMessage(parsed, "neuxus stream returned an error"),
      );
    }

    if (parsed.type === "content_block_start") {
      const index = parsed.index;
      const contentBlock = parsed.content_block;
      if (
        typeof index !== "number" ||
        !isObject(contentBlock) ||
        typeof contentBlock.type !== "string"
      ) {
        return;
      }
      blocks.set(index, { block: { ...contentBlock }, partialJson: "" });
      return;
    }

    if (parsed.type === "content_block_delta") {
      const index = parsed.index;
      const delta = parsed.delta;
      if (typeof index !== "number" || !isObject(delta)) return;
      const state = blocks.get(index);
      if (!state) return;
      if (delta.type === "text_delta" && typeof delta.text === "string") {
        state.block.text =
          (typeof state.block.text === "string" ? state.block.text : "") +
          delta.text;
        if (delta.text !== "") input.onText(delta.text);
      } else if (
        delta.type === "input_json_delta" &&
        typeof delta.partial_json === "string"
      ) {
        state.partialJson += delta.partial_json;
      }
      return;
    }

    if (parsed.type === "content_block_stop") {
      if (typeof parsed.index !== "number") return;
      const state = blocks.get(parsed.index);
      if (state) finalizeToolInput(state);
      return;
    }

    if (parsed.type === "message_delta" && isObject(parsed.delta)) {
      if (typeof parsed.delta.stop_reason === "string") {
        stopReason = parsed.delta.stop_reason;
      }
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      for (;;) {
        const match = /\r?\n\r?\n/.exec(buffer);
        if (!match || match.index === undefined) break;
        const block = buffer.slice(0, match.index);
        buffer = buffer.slice(match.index + match[0].length);
        consume(block);
      }
    }
    buffer += decoder.decode();
    if (buffer.trim() !== "") consume(buffer);
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    if (error instanceof NeuxusClientError || isAbortError(error)) throw error;
    throw new NeuxusClientError(502, "neuxus stream failed");
  }

  for (const state of blocks.values()) finalizeToolInput(state);
  const content = [...blocks.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, state]) => state.block);

  return {
    answer: textFromBlocks(content),
    requestId: res.headers.get("x-request-id"),
    content,
    stopReason,
  };
}
