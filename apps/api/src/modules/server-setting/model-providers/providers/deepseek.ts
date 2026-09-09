/**
 * Provider: DeepSeek. Anthropic-compatible.
 * Self-contained: owns its models, connection type, and validation.
 */

import { loadProviderConnection, saveProviderConnection } from "../dal.ts";
import { type ConnectionResult, ModelProvider } from "./provider.ts";
import type { Model } from "./types.ts";
import { PROVIDER_DEEPSEEK } from "./types.ts";

export type DeepSeekConnection = { apiKey: string };

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
}

export const provider = new DeepSeekProvider();
