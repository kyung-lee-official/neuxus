/**
 * Provider: Minimax (token plan). Anthropic-compatible.
 * Self-contained: owns its models, connection type, and validation.
 */

import { loadProviderConnection, saveProviderConnection } from "../dal.ts";
import { type ConnectionResult, ModelProvider } from "./provider.ts";
import type { Model } from "./types.ts";
import { PROVIDER_MINIMAX_TOKEN_PLAN } from "./types.ts";

export type MinimaxTokenPlanConnection = { apiKey: string };

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
}

export const provider = new MinimaxTokenPlanProvider();
