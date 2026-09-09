/**
 * Provider: Minimax (token plan). Anthropic-compatible.
 * Self-contained: owns its models, connection type, and validation.
 */

import { loadProviderConnection, saveProviderConnection } from "../dal.ts";
import { type ConnectionResult, ModelProvider } from "./provider.ts";
import type { Model } from "./types.ts";
import { PROVIDER_MINIMAX_TOKEN_PLAN } from "./types.ts";

export type MinimaxTokenPlanConnection = { apiKey: string };

type MessageContentBlock =
  | { type: "text"; text: string }
  | {
      type: "image";
      source: { type: "base64"; media_type: string; data: string };
    };

export class MinimaxTokenPlanProvider extends ModelProvider<MinimaxTokenPlanConnection> {
  override readonly id = PROVIDER_MINIMAX_TOKEN_PLAN;
  override readonly displayName = "Minimax (Token Plan)";
  override readonly baseUrl =
    "https://api.minimaxi.com/anthropic/v1/token-plan";
  override readonly headers = { "anthropic-version": "2023-06-01" };
  override readonly models: Model[] = [
    {
      id: "MiniMax-M3",
      displayName: "MiniMax-M3 (Token Plan)",
      capabilities: { text: true, vision: true },
      defaults: {
        contextWindowTokens: 1_000_000,
        maxOutputTokens: 4096,
        temperature: 1,
      },
    },
  ];

  override validateConnection(
    raw: unknown,
  ): ConnectionResult<MinimaxTokenPlanConnection> {
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

  override async loadConnection(): Promise<MinimaxTokenPlanConnection | null> {
    return (await loadProviderConnection(
      this.id,
    )) as unknown as MinimaxTokenPlanConnection | null;
  }

  override async saveConnection(
    raw: unknown,
  ): Promise<MinimaxTokenPlanConnection> {
    return (await saveProviderConnection(
      this.id,
      raw,
    )) as unknown as MinimaxTokenPlanConnection;
  }
  /** Wire call for this provider: Anthropic Messages API (`POST {baseUrl}/v1/messages`). */
  private async postMessages(
    modelId: string,
    apiKey: string,
    content: MessageContentBlock[],
  ): Promise<string> {
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
    const conn = await this.loadConnection();
    if (!conn || !("apiKey" in conn))
      throw new Error(`No api key saved for provider ${this.id}`);
    if (!this.baseUrl) throw new Error(`No base URL for provider ${this.id}`);
    return this.postMessages(modelId, (conn as { apiKey: string }).apiKey, [
      { type: "text", text: prompt },
    ]);
  }

  override async describeImage(
    modelId: string,
    image: { bytes: Buffer; mimeType: string },
  ): Promise<string> {
    const conn = await this.loadConnection();
    if (!conn || !("apiKey" in conn))
      throw new Error(`No api key saved for provider ${this.id}`);
    if (!this.baseUrl) throw new Error(`No base URL for provider ${this.id}`);
    return this.postMessages(modelId, (conn as { apiKey: string }).apiKey, [
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

export const provider = new MinimaxTokenPlanProvider();
