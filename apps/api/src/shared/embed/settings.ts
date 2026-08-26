import { getPrisma } from "../db.ts";
import {
  EMBED_DEFAULTS,
  type EmbedSettingsRow,
  type ResolvedEmbedSettings,
  resolveEmbedSettings,
  type StoredEmbedSettings,
  storedEmbedSettings,
} from "./defaults.ts";

const SETTINGS_ID = "default";

export type AdminEmbedSettings = StoredEmbedSettings & {
  defaults: {
    embeddingModel: string;
    provider: string;
    host: string;
    port: number;
    apiKey: string | null;
  };
};

function blankToNull(value: string | null | undefined): string | null {
  if (value == null) return null;
  const t = value.trim();
  return t === "" ? null : t;
}

function portOrNull(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : null;
}

async function fetchEmbedRow(): Promise<EmbedSettingsRow | null> {
  const row = await getPrisma().knowledgeEmbedSettings.findUnique({
    where: { id: SETTINGS_ID },
  });
  if (!row) return null;
  return {
    embeddingModel: row.embeddingModel,
    provider: row.provider,
    host: row.host,
    port: row.port,
    apiKey: row.apiKey,
  };
}

/** Upsert `kb_embed_settings` id `default`. Empty strings stored as null (app defaults). */
export async function saveEmbedSettings(
  row: EmbedSettingsRow,
): Promise<ResolvedEmbedSettings> {
  const embeddingModel = blankToNull(row.embeddingModel);
  const provider = blankToNull(row.provider);
  const host = blankToNull(row.host);
  const port = portOrNull(row.port);
  const apiKey = blankToNull(row.apiKey);

  await getPrisma().knowledgeEmbedSettings.upsert({
    where: { id: SETTINGS_ID },
    create: {
      id: SETTINGS_ID,
      embeddingModel,
      provider,
      host,
      port,
      apiKey,
    },
    update: {
      embeddingModel,
      provider,
      host,
      port,
      apiKey,
    },
  });

  return loadEmbedSettings();
}

/** Load `kb_embed_settings` id `default` and apply `EMBED_DEFAULTS` for nulls. */
export async function loadEmbedSettings(): Promise<ResolvedEmbedSettings> {
  return resolveEmbedSettings(await fetchEmbedRow());
}

export async function adminEmbedSettings(): Promise<AdminEmbedSettings> {
  return {
    ...storedEmbedSettings(await fetchEmbedRow()),
    defaults: {
      embeddingModel: EMBED_DEFAULTS.embeddingModel,
      provider: EMBED_DEFAULTS.provider,
      host: EMBED_DEFAULTS.host,
      port: EMBED_DEFAULTS.port,
      apiKey: EMBED_DEFAULTS.apiKey,
    },
  };
}

/** Write hardcoded `EMBED_DEFAULTS` into the settings row. */
export async function resetEmbedSettings(): Promise<AdminEmbedSettings> {
  await saveEmbedSettings({
    embeddingModel: EMBED_DEFAULTS.embeddingModel,
    provider: EMBED_DEFAULTS.provider,
    host: EMBED_DEFAULTS.host,
    port: EMBED_DEFAULTS.port,
    apiKey: EMBED_DEFAULTS.apiKey,
  });
  return adminEmbedSettings();
}
