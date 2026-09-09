/**
 * Model registry base types: capability tags, provider + model shapes.
 * Provider-specific connection types live with each provider module under
 * `providers/<providerId>.ts`.
 */

import {
  CAPABILITY_EMBEDDING,
  CAPABILITY_TEXT,
  CAPABILITY_VISION,
} from "./dal.ts";

/** Canonical capability tags — derived from the constants in `dal.ts`. */
export type CapabilityTag =
  | typeof CAPABILITY_EMBEDDING
  | typeof CAPABILITY_TEXT
  | typeof CAPABILITY_VISION;

export type Capabilities = Partial<Record<CapabilityTag, true>>;

export type Provider = {
  id: string;
  displayName: string;
  /** Fixed upstream endpoint, when the provider's connection has no base URL. */
  baseUrl?: string;
  /** Extra headers always sent (e.g. `anthropic-version`). */
  headers?: Record<string, string>;
  /** Models this provider serves. The provider scopes model identity. */
  models: Model[];
};

export type Model = {
  /** Model id, unique *within its provider* (scoped by `Provider.id`). */
  id: string;
  /** Human-readable name shown in the admin dropdown. */
  displayName: string;
  /** What this model can do. */
  capabilities: Capabilities;
  /** Hardcoded per-model defaults (catalog owns the wire params). */
  defaults: {
    contextWindowTokens?: number;
    maxOutputTokens?: number;
    embeddingDimensions?: number;
    temperature?: number;
  };
};

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
