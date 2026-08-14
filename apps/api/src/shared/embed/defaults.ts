/** App-level defaults for embed settings (DB may override). */

export const EMBED_DEFAULTS = {
  embeddingModel: "nomic-embed-text:latest",
  provider: "ollama",
  host: "127.0.0.1",
  port: 11434,
  apiKey: null as string | null,
} as const;

export type EmbedSettingsRow = {
  embeddingModel?: string | null;
  provider?: string | null;
  host?: string | null;
  port?: number | null;
  apiKey?: string | null;
};

export type ResolvedEmbedSettings = {
  embeddingModel: string;
  provider: string;
  host: string;
  port: number;
  apiKey: string | null;
};

export type StoredEmbedSettings = {
  embeddingModel: string | null;
  provider: string | null;
  host: string | null;
  port: number | null;
  apiKey: string | null;
};

function nonEmpty(value: string | null | undefined): string | undefined {
  if (value == null) return undefined;
  const t = value.trim();
  return t === "" ? undefined : t;
}

export function storedEmbedSettings(
  row?: EmbedSettingsRow | null,
): StoredEmbedSettings {
  const port = row?.port;
  return {
    embeddingModel: nonEmpty(row?.embeddingModel) ?? null,
    provider: nonEmpty(row?.provider) ?? null,
    host: nonEmpty(row?.host) ?? null,
    port:
      typeof port === "number" && Number.isInteger(port) && port > 0
        ? port
        : null,
    apiKey: nonEmpty(row?.apiKey) ?? null,
  };
}

export function resolveEmbedSettings(
  row?: EmbedSettingsRow | null,
): ResolvedEmbedSettings {
  const port = row?.port;
  return {
    embeddingModel:
      nonEmpty(row?.embeddingModel) ?? EMBED_DEFAULTS.embeddingModel,
    provider: nonEmpty(row?.provider) ?? EMBED_DEFAULTS.provider,
    host: nonEmpty(row?.host) ?? EMBED_DEFAULTS.host,
    port:
      typeof port === "number" && Number.isInteger(port) && port > 0
        ? port
        : EMBED_DEFAULTS.port,
    apiKey: nonEmpty(row?.apiKey) ?? EMBED_DEFAULTS.apiKey,
  };
}
