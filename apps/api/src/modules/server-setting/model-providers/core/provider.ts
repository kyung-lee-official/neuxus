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
  async chat(modelId: string, prompt: string): Promise<string> {
    throw new Error(`chat is not supported by provider ${this.id}`);
  }

  /** Chat with an image (image in, text out). Providers without this capability throw. */
  async chatWithImage(
    modelId: string,
    prompt: string,
    image: { bytes: Buffer; mimeType: string },
  ): Promise<string> {
    throw new Error(`chatWithImage is not supported by provider ${this.id}`);
  }
}
