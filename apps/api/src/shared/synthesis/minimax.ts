import type { ResolvedSynthesisSettings } from "./defaults.ts";
import type { Synthesizer } from "./types.ts";

const ANTHROPIC_VERSION = "2023-06-01";

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
      const res = await fetch(`${settings.baseUrl}/v1/messages`, {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: settings.synthesisModel,
          max_tokens: settings.maxTokens,
          temperature: 1,
          system:
            "You answer using only the context in the user message. If the provided sources do not contain the answer, say so clearly.",
          messages: [
            { role: "user", content: [{ type: "text", text: prompt }] },
          ],
        }),
      });
      const body = await res.text();
      if (!res.ok) {
        throw new Error(`MiniMax messages failed (${res.status})`);
      }
      let json: AnthropicMessageResponse;
      try {
        json = JSON.parse(body) as AnthropicMessageResponse;
      } catch {
        throw new Error("MiniMax returned non-JSON");
      }
      const out = textFromAnthropicResponse(json);
      if (!out) throw new Error("MiniMax returned empty content");
      return out;
    },
  };
}
