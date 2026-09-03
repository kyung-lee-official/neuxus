/**
 * Vision LLM provider for image description. Sends the image bytes
 * (base64) plus a short text prompt to the MiniMax Anthropic-compatible
 * Messages API and returns the assistant's description text.
 *
 * Uses the same endpoint and headers as the synthesis synthesizer
 * (`shared/synthesis/minimax.ts`) — MiniMax-M3's Anthropic-compatible
 * endpoint accepts image content blocks:
 *
 *   { type: "image", source: { type: "base64", media_type, data } }
 */

import type { ResolvedSynthesisSettings } from "../synthesis/defaults.ts";
import { ANTHROPIC_VERSION } from "../synthesis/minimax.ts";

const DESCRIPTION_PROMPT =
  "Describe this image in one concise paragraph. Focus on the technical content: what is shown, the meaning of any labels or values, and any diagram relationships. Do not start with phrases like 'This image shows' — start directly with the subject. Do not repeat information that is already described in nearby text. Output only the description, no preamble.";

export type ImageDescriber = {
  describe(image: {
    /** Absolute filesystem path, used for logging only. */
    absolutePath: string;
    /** Raw bytes of the image file. */
    bytes: Buffer;
    /** MIME type (e.g. `image/png`, `image/jpeg`). */
    mimeType: string;
  }): Promise<string>;
};

type ContentBlock =
  | { type: "text"; text: string }
  | {
      type: "image";
      source: { type: "base64"; media_type: string; data: string };
    };

type AnthropicMessageResponse = {
  content?: Array<{ type?: string; text?: string }>;
};

function textFromResponse(json: AnthropicMessageResponse): string {
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

export function createMinimaxImageDescriber(
  settings: Pick<
    ResolvedSynthesisSettings,
    "baseUrl" | "apiKey" | "synthesisModel"
  >,
): ImageDescriber {
  const apiKey = settings.apiKey;
  if (!apiKey) {
    throw new Error("api_key is required for MiniMax image describer");
  }

  return {
    async describe({ bytes, mimeType, absolutePath }) {
      const data = bytes.toString("base64");
      const body = {
        model: settings.synthesisModel,
        max_tokens: 1024,
        temperature: 1,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: mimeType,
                  data,
                },
              },
              { type: "text", text: DESCRIPTION_PROMPT },
            ],
          },
        ],
      };
      const res = await fetch(`${settings.baseUrl}/v1/messages`, {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        throw new Error(
          `MiniMax image description failed (${res.status}) for ${absolutePath}`,
        );
      }
      const responseText = await res.text();
      let json: AnthropicMessageResponse;
      try {
        json = JSON.parse(responseText) as AnthropicMessageResponse;
      } catch {
        throw new Error(`MiniMax returned non-JSON for ${absolutePath}`);
      }
      const out = textFromResponse(json);
      if (!out) {
        throw new Error(
          `MiniMax returned empty description for ${absolutePath}`,
        );
      }
      return out;
    },
  };
}
