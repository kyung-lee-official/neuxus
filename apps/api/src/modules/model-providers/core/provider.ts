/**
 * Abstract base for a self-contained provider. Each provider is a
 * stateless singleton: pure data (id, display name, models, fixed base
 * URL/headers), per-provider connection validation, and config I/O that
 * each concrete provider implements through the connection DAL.
 */

import type { Model, Provider } from "./types.ts";

export type ConnectionResult<C> =
  | { ok: true; connection: C }
  | { ok: false; error: string };

export abstract class ModelProvider<C extends {}> implements Provider {
  abstract readonly id: string;
  abstract readonly displayName: string;
  readonly baseUrl?: string;
  readonly headers?: Record<string, string>;
  abstract readonly models: Model[];

  abstract validateConnection(raw: unknown): ConnectionResult<C>;

  /** Read this provider's saved connection payload, or null. */
  abstract loadConnection(): Promise<C | null>;

  /** Save this provider's connection payload. */
  abstract saveConnection(raw: unknown): Promise<C>;

  /** Embed texts → vectors. Providers without this capability throw. */
  async embed(modelId: string, texts: string[]): Promise<number[][]> {
    throw new Error(`embed is not supported by provider ${this.id}`);
  }

  /** Chat (text in, text out). Providers without this capability throw. */
  async textChat(modelId: string, prompt: string): Promise<string> {
    throw new Error(`textChat is not supported by provider ${this.id}`);
  }

  /** Chat with an image (image in, text out). Providers without this capability throw. */
  async imageChat(
    modelId: string,
    prompt: string,
    image: { bytes: Buffer; mimeType: string },
  ): Promise<string> {
    throw new Error(`imageChat is not supported by provider ${this.id}`);
  }

  /**
   * Forward a complete Anthropic Messages request and return the parsed
   * response. Providers that cannot accept Anthropic Messages throw.
   */
  async forwardMessages(
    _modelId: string,
    _body: Record<string, unknown>,
    _headers?: Record<string, string>,
  ): Promise<unknown> {
    throw new Error(`forwardMessages is not supported by provider ${this.id}`);
  }

  /** Forward an Anthropic SSE request and return the upstream response. */
  async forwardMessagesStream(
    _modelId: string,
    _body: Record<string, unknown>,
    _headers?: Record<string, string>,
  ): Promise<Response> {
    throw new Error(
      `forwardMessagesStream is not supported by provider ${this.id}`,
    );
  }

  /** Shared Anthropic-compatible streaming forwarder. */
  protected async forwardAnthropicStream(
    apiKey: string,
    modelId: string,
    body: Record<string, unknown>,
    headers?: Record<string, string>,
  ): Promise<Response> {
    if (!this.baseUrl) throw new Error(`No base URL for provider ${this.id}`);
    const res = await fetch(`${this.baseUrl.replace(/\/$/, "")}/v1/messages`, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        ...(this.headers ?? {}),
        ...(headers ?? {}),
      },
      body: JSON.stringify({ ...body, model: modelId, stream: true }),
    });
    if (!res.ok) {
      const raw = await res.text();
      let msg: string | null = null;
      try {
        const json = JSON.parse(raw) as { error?: { message?: string } };
        msg = json.error?.message?.trim() ?? null;
      } catch {
        /* ignore */
      }
      throw new Error(
        msg || raw.trim() || `Request failed with status ${res.status}`,
      );
    }
    return res;
  }

  /** Shared Anthropic-compatible forwarder for providers with an `apiKey`. */
  protected async forwardAnthropicMessages(
    apiKey: string,
    modelId: string,
    body: Record<string, unknown>,
    headers?: Record<string, string>,
  ): Promise<unknown> {
    if (!this.baseUrl) throw new Error(`No base URL for provider ${this.id}`);
    const res = await fetch(`${this.baseUrl.replace(/\/$/, "")}/v1/messages`, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "Content-Type": "application/json",
        ...(this.headers ?? {}),
        ...(headers ?? {}),
      },
      body: JSON.stringify({ ...body, model: modelId }),
    });
    const raw = await res.text();
    if (!res.ok) {
      let msg: string | null = null;
      try {
        const json = JSON.parse(raw) as { error?: { message?: string } };
        msg = json.error?.message?.trim() ?? null;
      } catch {
        /* ignore */
      }
      throw new Error(
        msg || raw.trim() || `Request failed with status ${res.status}`,
      );
    }
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      throw new Error("Anthropic-compatible provider returned non-JSON");
    }
  }
}
