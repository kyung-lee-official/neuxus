/**
 * Chat adapter for the stateless neuxus `/v1/messages` endpoint. The chat app
 * owns users, sessions, and memory; neuxus owns KB enrichment.
 */

import { neuxusApiUrl, neuxusServiceToken } from "../../shared/config.ts";

export class NeuxusClientError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "NeuxusClientError";
    this.status = status;
  }
}

type ContentBlock = { type?: unknown; text?: unknown };

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

function textFromContent(value: unknown): string {
  if (!isObject(value) || !Array.isArray(value.content)) {
    throw new NeuxusClientError(
      502,
      "neuxus returned a response without message content",
    );
  }
  const parts = value.content
    .filter(
      (block): block is ContentBlock =>
        isObject(block) && block.type === "text",
    )
    .map((block) => (typeof block.text === "string" ? block.text.trim() : ""))
    .filter((text) => text !== "");
  if (parts.length === 0) {
    throw new NeuxusClientError(502, "neuxus returned an empty answer");
  }
  return parts.join("\n\n");
}

export type NeuxusAnswer = {
  answer: string;
  requestId: string | null;
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
      signal: AbortSignal.timeout(120_000),
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

  const requestId = res.headers.get("x-request-id");
  return { answer: textFromContent(data), requestId };
}
