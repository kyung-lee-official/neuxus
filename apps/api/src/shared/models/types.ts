/**
 * Model registry: capability tags, model + provider shapes, and persisted
 * per-task slots.
 *
 * The catalog (`catalog.ts`) owns every supported model and provider —
 * the `app_model_config` row only stores which `modelId` the user picked
 * for each task plus optional per-provider connection overrides.
 */

export type CapabilityTag = "embedding" | "llm" | "vision";

export type Capabilities = Partial<Record<CapabilityTag, true>>;

/**
 * User-overridable fields the catalog supports. The UI renders only the
 * fields declared by the chosen model's provider.
 */
export type UserInputField = "apiKey" | "baseUrl" | "port";

export type RequestShape =
  | "anthropic-messages"
  | "openai-embeddings"
  | "ollama-embed";

export type Provider = {
  id: string;
  displayName: string;
  baseUrl: string;
  requestShape: RequestShape;
  /** Extra headers always sent (e.g. `anthropic-version`). */
  headers?: Record<string, string>;
  /** Fields the admin UI must expose for this provider. */
  userInputs: UserInputField[];
};

export type Model = {
  /** Globally-unique model id used in the persisted config. */
  id: string;
  /** Foreign key into `PROVIDERS`. */
  providerId: string;
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

/**
 * Per-provider connection settings (one row in the
 * `providerConnections` map on `app_model_config`). Connection fields
 * are provider-level — every model under one provider shares the same
 * key, base URL, and port — so the map is keyed by `providerId`, not
 * `modelId`. Each field is always defined (may be `null`) so the JSON
 * shape round-trips cleanly.
 */
export type ProviderConnection = {
  /** API key sent on every request to this provider. Required when the
   * provider's `userInputs` contains `"apiKey"`; otherwise leave null. */
  apiKey: string | null;
  /** Base URL override (e.g. local Ollama). Replaces the provider's
   * catalog `baseUrl` entirely when set. */
  baseUrl: string | null;
  /** Port override. Replaces the port of the (provider default or
   * overridden) base URL when set. */
  port: number | null;
};

/**
 * Connection merged with the provider's catalog defaults — what
 * adapters actually use to reach the upstream API. `baseUrl` is the
 * post-override URL; `apiKey` is the post-default null value.
 */
export type ResolvedConnection = {
  baseUrl: string;
  apiKey: string | null;
};

/**
 * Resolved at runtime: catalog entry + provider + resolved connection.
 * Callers can hand `connection` straight to adapter clients — clients
 * no longer recompute the baseUrl / apiKey from `Provider`.
 */
export type ResolvedModel = {
  task: CapabilityTag;
  connection: ResolvedConnection;
  model: Model;
  provider: Provider;
};

/**
 * Persisted shape of `app_model_config`. `providerConnections` keys are
 * catalog `providerId`s; `tasks[tag]` is one of the catalog `modelId`s
 * (or null) that the provider entry must cover.
 */
export type ModelConfig = {
  /** Keyed by catalog `providerId`. Empty object when nothing configured. */
  providerConnections: Record<string, ProviderConnection>;
  /** Active model id for each task, or null. */
  tasks: {
    embedding: string | null;
    llm: string | null;
    vision: string | null;
  };
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
