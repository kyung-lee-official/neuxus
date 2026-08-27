import type { ResolvedSynthesisSettings } from "./defaults.ts";
import type { Synthesizer } from "./types.ts";

export const ANTHROPIC_VERSION = "2023-06-01";

/**
 * System prompt sent on every MiniMax Messages request. Exported so the
 * logging wrapper can include it in `app_log` so the full content of
 * what the LLM received is recoverable.
 */
export const MINIMAX_SYSTEM_PROMPT =
  "Answer ONLY the user's current question (the last line of the user message). " +
  "Use the knowledge-base parents, personal memory, and recent conversation provided. " +
  "Recent conversation is for understanding the user — do NOT continue or repeat prior topics unless the current question explicitly references them. " +
  "If the knowledge base does not contain the answer, say so clearly.";

/** Sampling temperature. Fixed for now; raise it via this constant if you want variability. */
export const MINIMAX_TEMPERATURE = 1;

export type MinimaxRequestBody = {
  model: string;
  max_tokens: number;
  temperature: number;
  system: string;
  messages: Array<{
    role: "user";
    content: Array<{ type: "text"; text: string }>;
  }>;
};

/** Build the exact JSON body the MiniMax Messages endpoint receives. */
export function buildMinimaxRequestBody(
  settings: Pick<ResolvedSynthesisSettings, "synthesisModel" | "maxTokens">,
  prompt: string,
): MinimaxRequestBody {
  return {
    model: settings.synthesisModel,
    max_tokens: settings.maxTokens,
    temperature: MINIMAX_TEMPERATURE,
    system: MINIMAX_SYSTEM_PROMPT,
    messages: [{ role: "user", content: [{ type: "text", text: prompt }] }],
  };
}

type AnthropicContentBlock = {
  type?: string;
  text?: string;
};

type AnthropicMessageResponse = {
  content?: AnthropicContentBlock[];
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

/** MiniMax Anthropic-compatible Messages client. Callers should use `Synthesizer`. */
export function createMinimaxSynthesizer(
  settings: Pick<
    ResolvedSynthesisSettings,
    "baseUrl" | "apiKey" | "synthesisModel" | "maxTokens"
  >,
): Synthesizer {
  const apiKey = settings.apiKey;
  if (!apiKey) {
    throw new Error("api_key is required for MiniMax synthesis");
  }

  return {
    async synthesize(prompt: string): Promise<string> {
      const body = buildMinimaxRequestBody(settings, prompt);
      const res = await fetch(`${settings.baseUrl}/v1/messages`, {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const responseText = await res.text();
      if (!res.ok) {
        throw new Error(`MiniMax messages failed (${res.status})`);
      }
      let json: AnthropicMessageResponse;
      try {
        json = JSON.parse(responseText) as AnthropicMessageResponse;
      } catch {
        throw new Error("MiniMax returned non-JSON");
      }
      const out = textFromAnthropicResponse(json);
      if (!out) throw new Error("MiniMax returned empty content");
      return out;
    },
  };
}
