/**
 * Model registry: capability tags, model + provider shapes, and persisted
 * per-task slots.
 *
 * The catalog (`catalog.ts`) owns every supported model and provider — the
 * `app_model_config` row only stores which `modelId` the user picked for
 * each task plus optional per-slot connection overrides.
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
 * Persisted per-task slot (`app_model_config.embedding` /
 * `.llm` / `.vision`). Stored as JSON; the union fields mirror
 * `Provider.userInputs`. Each connection field is always present (may
 * be `null`) so the JSON shape is stable round-tripping.
 */
export type ModelSlot = {
  /** Catalog model id. */
  modelId: string;
  /** Per-slot API key override. Falls back to "no override" — providers
   * without `apiKey` user input simply ignore it. */
  apiKey: string | null;
  /** Per-slot base URL override (e.g. local Ollama). */
  baseUrl: string | null;
  /** Per-slot port override (e.g. local Ollama). */
  port: number | null;
};

/** Resolved at runtime: catalog entry + provider + slot overrides merged. */
export type ResolvedModel = {
  task: CapabilityTag;
  slot: ModelSlot;
  model: Model;
  provider: Provider;
};

export type ModelConfig = {
  embedding: ModelSlot | null;
  llm: ModelSlot | null;
  vision: ModelSlot | null;
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
