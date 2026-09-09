/**
 * Abstract base for a self-contained provider. Each provider is a
 * stateless singleton: pure data (id, display name, models, fixed base
 * URL/headers) plus per-provider connection validation.
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
}
