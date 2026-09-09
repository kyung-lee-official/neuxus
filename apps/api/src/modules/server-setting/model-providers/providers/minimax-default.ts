/**
 * Provider: Minimax (default plan). Anthropic-compatible.
 * Self-contained: owns its models, connection type, and validation.
 */

import type { Model } from "../types.ts";
import { type ConnectionResult, ModelProvider } from "./provider.ts";
import { PROVIDER_MINIMAX_DEFAULT } from "./types.ts";

export type MinimaxDefaultConnection = { apiKey: string };

export class MinimaxDefaultProvider extends ModelProvider<MinimaxDefaultConnection> {
  override readonly id = PROVIDER_MINIMAX_DEFAULT;
  override readonly displayName = "Minimax";
  override readonly baseUrl = "https://api.minimaxi.com/anthropic";
  override readonly headers = { "anthropic-version": "2023-06-01" };
  override readonly models: Model[] = [
    {
      id: "MiniMax-M3",
      displayName: "MiniMax-M3",
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
  ): ConnectionResult<MinimaxDefaultConnection> {
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
}

export const provider = new MinimaxDefaultProvider();
