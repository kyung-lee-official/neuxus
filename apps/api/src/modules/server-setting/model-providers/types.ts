/**
 * Model registry base types: capability tags, provider + model shapes.
 * Provider-specific connection types live with each provider module under
 * `providers/<providerId>.ts`.
 */

import type { CapabilityTag, Model, Provider } from "./providers/types.ts";

/** Flat model view with its owning provider id attached (for APIs/consumers). */
export type ProviderModel = Model & {
  providerId: string;
};

/**
 * Connection merged with the provider's catalog defaults — what adapter
 * clients actually use to reach the upstream API.
 */
export type ResolvedConnection = {
  baseUrl: string;
  apiKey: string | null;
};

/**
 * Resolved at runtime: catalog entry + provider + resolved connection.
 */
export type ResolvedModel = {
  task: CapabilityTag;
  connection: ResolvedConnection;
  model: Model;
  provider: Provider;
};

/** Public client interfaces — stable contracts callers depend on. */
export type Embedder = {
  embed(texts: string[]): Promise<number[][]>;
};

export type Synthesizer = {
  synthesize(prompt: string): Promise<string>;
};

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
