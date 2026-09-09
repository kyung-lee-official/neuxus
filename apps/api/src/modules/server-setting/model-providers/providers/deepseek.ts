/**
 * Provider: DeepSeek. Anthropic-compatible.
 * Self-contained: owns its models, connection type, and validation.
 */

import { loadProviderConnection, saveProviderConnection } from "../dal.ts";
import { type ConnectionResult, ModelProvider } from "./provider.ts";
import type { Model } from "./types.ts";
import { PROVIDER_DEEPSEEK } from "./types.ts";

export type DeepSeekConnection = { apiKey: string };

type MessageContentBlock =
  | { type: "text"; text: string }
  | {
      type: "image";
      source: { type: "base64"; media_type: string; data: string };
    };

export class DeepSeekProvider extends ModelProvider<DeepSeekConnection> {
  override readonly id = PROVIDER_DEEPSEEK;
  override readonly displayName = "DeepSeek";
  override readonly baseUrl = "https://api.deepseek.com/anthropic";
  override readonly headers = { "anthropic-version": "2023-06-01" };
  override readonly models: Model[] = [
    {
      id: "deepseek-v4-flash",
      displayName: "DeepSeek V4 Flash",
      capabilities: { text: true },
      defaults: {
        contextWindowTokens: 128_000,
        maxOutputTokens: 8192,
      },
    },
    {
      id: "deepseek-v4-pro",
      displayName: "DeepSeek V4 Pro",
      capabilities: { text: true },
      defaults: {
        contextWindowTokens: 128_000,
        maxOutputTokens: 8192,
      },
    },
    {
      id: "deepseek-v4-flash-vision-exp",
      displayName: "DeepSeek V4 Flash Vision (Experimental)",
      capabilities: { text: true, vision: true },
      defaults: {
        contextWindowTokens: 128_000,
        maxOutputTokens: 8192,
      },
    },
  ];

  override validateConnection(
    raw: unknown,
  ): ConnectionResult<DeepSeekConnection> {
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
      return { ok: false, error: "must be an object with apiKey" };
    }
    const keys = Object.keys(raw as Record<string, unknown>);
    if (!keys.every((k) => k === "apiKey")) {
      return { ok: false, error: "only apiKey is allowed" };
    }
    const apiKey = (raw as Record<string, unknown>).apiKey;
    if (
      typeof apiKey !== "string" ||
      apiKey === "" ||
      apiKey !== apiKey.trim()
    ) {
      return {
        ok: false,
        error: "apiKey must be a non-empty, untrimmed string",
      };
    }
    return { ok: true, connection: { apiKey } };
  }

  override async loadConnection(): Promise<DeepSeekConnection | null> {
    return (await loadProviderConnection(
      this.id,
    )) as unknown as DeepSeekConnection | null;
  }

  override async saveConnection(raw: unknown): Promise<DeepSeekConnection> {
    return (await saveProviderConnection(
      this.id,
      raw,
    )) as unknown as DeepSeekConnection;
  }

  /** Wire call for this provider: Anthropic Messages API (`POST {baseUrl}/v1/messages`). */
  private async postMessages(
    modelId: string,
    content: MessageContentBlock[],
  ): Promise<string> {
    const conn = await this.loadConnection();
    if (!conn || !("apiKey" in conn) || typeof conn.apiKey !== "string")
      throw new Error(`No api key saved for provider ${this.id}`);
    const apiKey = conn.apiKey;
    if (!this.baseUrl) throw new Error(`No base URL for provider ${this.id}`);
    const res = await fetch(`${this.baseUrl.replace(/\/$/, "")}/v1/messages`, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "Content-Type": "application/json",
        ...(this.headers ?? {}),
      },
      body: JSON.stringify({
        model: modelId,
        max_tokens: 4096,
        temperature: 1,
        system: "You are a helpful assistant.",
        messages: [{ role: "user", content }],
      }),
    });
    const raw = await res.text();
    if (!res.ok) {
      let msg: string | null = null;
      try {
        const j = JSON.parse(raw) as { error?: { message?: string } };
        msg = j.error?.message?.trim() ?? null;
      } catch {
        /* ignore */
      }
      throw new Error(
        msg || raw.trim() || `Request failed with status ${res.status}`,
      );
    }
    let json: { content?: Array<{ type?: string; text?: string }> };
    try {
      json = JSON.parse(raw);
    } catch {
      throw new Error("Anthropic-compatible provider returned non-JSON");
    }
    const parts = (json.content ?? [])
      .filter(
        (b) =>
          b.type === "text" && typeof b.text === "string" && b.text!.trim(),
      )
      .map((b) => b.text!.trim());
    if (parts.length === 0) throw new Error("Model returned empty content");
    return parts.join("\n\n");
  }
  override async chat(modelId: string, prompt: string): Promise<string> {
    return this.postMessages(modelId, [{ type: "text", text: prompt }]);
  }

  override async describeImage(
    modelId: string,
    image: { bytes: Buffer; mimeType: string },
  ): Promise<string> {
    return this.postMessages(modelId, [
      {
        type: "image",
        source: {
          type: "base64",
          media_type: image.mimeType,
          data: image.bytes.toString("base64"),
        },
      },
      { type: "text", text: "Describe this image in one concise paragraph." },
    ]);
  }
}

export const provider = new DeepSeekProvider();
