/**
 * Vision (image description) capability client.
 *
 * Wraps an `AnthropicMessagesClient`. Reuses the same wire format as
 * the chat client — the only difference is the user `content` array
 * contains an image block followed by a text prompt, plus a smaller
 * `max_tokens` cap.
 */

import {
  AnthropicMessagesClient,
  textFromAnthropicResponse,
} from "../adapters/anthropic-messages.ts";
import type {
  ImageDescriber,
  Model,
  Provider,
  ResolvedConnection,
} from "../types.ts";

/**
 * Fixed description prompt — same wording the previous
 * `createMinimaxImageDescriber` used. Vision is a task behavior, not a
 * model property, so this is shared across all vision-capable models.
 */
export const VISION_DESCRIPTION_PROMPT =
  "Describe this image in one concise paragraph. Focus on the technical content: what is shown, the meaning of any labels or values, and any diagram relationships. Do not start with phrases like 'This image shows' — start directly with the subject. Do not repeat information that is already described in nearby text. Output only the description, no preamble.";

const DEFAULT_MAX_TOKENS = 1024;
const DEFAULT_TEMPERATURE = 1;

export type VisionClientOptions = {
  model: Model;
  provider: Provider;
  /** Resolved `baseUrl` + `apiKey` for this provider. Routed upstream via
   * `requireApiKey` so `apiKey` is non-null for cloud providers. */
  connection: ResolvedConnection;
  /** Convenience: `connection.apiKey` validated non-null. Routed via
   * `requireApiKey` upstream; kept as a separate parameter so the
   * AnthropicMessagesClient constructor (which requires `string`) keeps
   * its existing shape. */
  apiKey: string;
};

export type CreateVisionClient = (
  options: VisionClientOptions,
) => ImageDescriber;

export const createVisionClient: CreateVisionClient = ({
  model,
  provider,
  connection,
  apiKey,
}) => {
  const client = new AnthropicMessagesClient({
    baseUrl: connection.baseUrl,
    apiKey,
    headers: provider.headers,
  });
  const maxTokens = model.defaults.maxOutputTokens ?? DEFAULT_MAX_TOKENS;
  const temperature = model.defaults.temperature ?? DEFAULT_TEMPERATURE;

  return {
    async describe({
      bytes,
      mimeType,
    }: {
      absolutePath: string;
      bytes: Buffer;
      mimeType: string;
    }): Promise<string> {
      const data = bytes.toString("base64");
      const json = await client.sendMessage({
        model: model.id,
        max_tokens: maxTokens,
        temperature,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: { type: "base64", media_type: mimeType, data },
              },
              { type: "text", text: VISION_DESCRIPTION_PROMPT },
            ],
          },
        ],
      });
      const out = textFromAnthropicResponse(json);
      if (!out) {
        throw new Error(`${model.displayName} returned empty description`);
      }
      return out;
    },
  };
};
