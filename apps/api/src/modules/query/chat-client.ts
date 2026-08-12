/** Anthropic-compatible Messages API base (platform.minimaxi.com). */
const DEFAULT_MINIMAX_BASE = "https://api.minimaxi.com/anthropic";
const DEFAULT_SYNTHESIS_MODEL = "MiniMax-M3";
const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_MAX_TOKENS = 4096;

export function minimaxApiKey(): string {
  const key = process.env.MINIMAX_API_KEY?.trim();
  if (!key) {
    throw new Error(
      "MINIMAX_API_KEY is required for ask-mode synthesis. Set it in .env at the repo root.",
    );
  }
  return key;
}

/** Ask-mode synthesis model id (MiniMax Anthropic-compatible API). */
export function synthesisModelId(): string {
  const configured = process.env.SYNTHESIS_MODEL?.trim();
  if (!configured) return DEFAULT_SYNTHESIS_MODEL;
  // Allow optional `provider:model` form (e.g. minimax:MiniMax-M3).
  if (configured.includes(":")) {
    return configured.split(":").slice(1).join(":");
  }
  return configured;
}

function minimaxBaseUrl(): string {
  return (process.env.MINIMAX_API_BASE_URL ?? DEFAULT_MINIMAX_BASE).replace(
    /\/$/,
    "",
  );
}

function maxTokens(): number {
  const raw = process.env.SYNTHESIS_MAX_TOKENS?.trim();
  if (!raw) return DEFAULT_MAX_TOKENS;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_MAX_TOKENS;
  return n;
}

type AnthropicContentBlock = {
  type?: string;
  text?: string;
};

type AnthropicMessageResponse = {
  content?: AnthropicContentBlock[];
  error?: { message?: string; type?: string };
};

function textFromAnthropicResponse(json: AnthropicMessageResponse): string {
  const blocks = json.content ?? [];
  const parts: string[] = [];
  for (const block of blocks) {
    if (block.type === "text" && typeof block.text === "string") {
      const t = block.text.trim();
      if (t) parts.push(t);
    }
  }
  return parts.join("\n\n").trim();
}

async function callMinimaxMessages(input: {
  system: string;
  userContent: unknown[];
  maxTokens?: number;
  temperature?: number;
}): Promise<string> {
  const res = await fetch(`${minimaxBaseUrl()}/v1/messages`, {
    method: "POST",
    headers: {
      "x-api-key": minimaxApiKey(),
      "anthropic-version": ANTHROPIC_VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: synthesisModelId(),
      max_tokens: input.maxTokens ?? maxTokens(),
      temperature: input.temperature ?? 1,
      system: input.system,
      messages: [{ role: "user", content: input.userContent }],
    }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`MiniMax messages failed (${res.status}): ${text}`);
  }
  let json: AnthropicMessageResponse;
  try {
    json = JSON.parse(text) as AnthropicMessageResponse;
  } catch {
    throw new Error(`MiniMax returned non-JSON: ${text.slice(0, 200)}`);
  }
  const out = textFromAnthropicResponse(json);
  if (!out) throw new Error("MiniMax returned empty content");
  return out;
}

/**
 * Synthesize an answer via MiniMax Anthropic-compatible Messages API.
 * @see https://platform.minimaxi.com/docs/api-reference/text-anthropic-api
 */
export async function synthesizeAnswer(prompt: string): Promise<string> {
  return callMinimaxMessages({
    system:
      "You answer using only the personal memory and conversation context in the user message. If the provided sources do not contain the answer, say so clearly.",
    userContent: [{ type: "text", text: prompt }],
  });
}
