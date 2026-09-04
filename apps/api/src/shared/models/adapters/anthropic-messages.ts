/**
 * Anthropic Messages protocol adapter.
 *
 * Covers all `requestShape: "anthropic-messages"` providers in
 * `providers.ts` — Minimax (default + token plan) and DeepSeek. Each
 * provider supplies its own `baseUrl` + headers; this module only
 * defines the wire contract.
 *
 * MiniMax-M3's Anthropic-compatible endpoint accepts image content
 * blocks: `{ type: "image", source: { type: "base64", media_type, data } }`
 * — same shape as Anthropic's native Messages API. DeepSeek V4 Flash
 * Vision (experimental) accepts the same shape, so chat and vision
 * clients share this adapter.
 */

export type ContentBlock =
  | { type: "text"; text: string }
  | {
      type: "image";
      source: { type: "base64"; media_type: string; data: string };
    };

export type AnthropicMessagesRequest = {
  model: string;
  max_tokens: number;
  temperature?: number;
  system?: string;
  messages: Array<{ role: "user"; content: ContentBlock[] }>;
};

type AnthropicContentBlock = {
  type?: string;
  text?: string;
};

type AnthropicMessagesResponse = {
  content?: AnthropicContentBlock[];
};

export type AnthropicMessagesClientOptions = {
  baseUrl: string;
  apiKey: string;
  headers?: Record<string, string>;
};

export class AnthropicMessagesClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly headers: Record<string, string>;

  constructor(options: AnthropicMessagesClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.apiKey = options.apiKey;
    this.headers = options.headers ?? {};
  }

  async sendMessage(
    body: AnthropicMessagesRequest,
  ): Promise<AnthropicMessagesResponse> {
    const res = await fetch(`${this.baseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "x-api-key": this.apiKey,
        "Content-Type": "application/json",
        ...this.headers,
      },
      body: JSON.stringify(body),
    });
    const responseText = await res.text();
    if (!res.ok) {
      throw new Error(extractErrorMessage(responseText, res.status));
    }
    let json: AnthropicMessagesResponse;
    try {
      json = JSON.parse(responseText) as AnthropicMessagesResponse;
    } catch {
      throw new Error("Anthropic-compatible provider returned non-JSON");
    }
    return json;
  }
}

/** Concatenate text blocks of a Messages response. */
export function textFromAnthropicResponse(
  json: AnthropicMessagesResponse,
): string {
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

/**
 * Surface the provider's own error text. Anthropic-compatible providers
 * (Minimax, DeepSeek) return `{ type, error: { type, message } }` on
 * non-OK responses — we propagate `error.message` verbatim so the real
 * cause (rate limit, auth, model name, …) reaches the caller.
 */
function extractErrorMessage(responseText: string, status: number): string {
  if (responseText) {
    try {
      const json = JSON.parse(responseText) as {
        error?: { message?: string };
      };
      const msg = json.error?.message?.trim();
      if (msg) return msg;
    } catch {
      // non-JSON body — fall through to raw text below.
    }
    const raw = responseText.trim();
    if (raw) return raw;
  }
  return `Request failed with status ${status}`;
}
