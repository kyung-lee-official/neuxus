import { getPrisma } from "../db.ts";
import {
  type ResolvedSynthesisSettings,
  resolveSynthesisSettings,
  type StoredSynthesisSettings,
  SYNTHESIS_DEFAULTS,
  type SynthesisSettingsRow,
  storedSynthesisSettings,
} from "./defaults.ts";

const SETTINGS_ID = "default";

export type AdminSynthesisSettings = StoredSynthesisSettings & {
  defaults: {
    provider: string;
    synthesisModel: string;
    baseUrl: string;
    apiKey: string | null;
    maxTokens: number;
    contextWindowTokens: number;
  };
};

function blankToNull(value: string | null | undefined): string | null {
  if (value == null) return null;
  const t = value.trim();
  return t === "" ? null : t;
}

function positiveIntOrNull(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : null;
}

async function fetchSynthesisRow(): Promise<SynthesisSettingsRow | null> {
  const row = await getPrisma().appSynthesisSettings.findUnique({
    where: { id: SETTINGS_ID },
  });
  if (!row) return null;
  return {
    provider: row.provider,
    synthesisModel: row.synthesisModel,
    baseUrl: row.baseUrl,
    apiKey: row.apiKey,
    maxTokens: row.maxTokens,
    contextWindowTokens: row.contextWindowTokens,
  };
}

/** Upsert `app_synthesis_settings` id `default`. Empty strings stored as null. */
export async function saveSynthesisSettings(
  row: SynthesisSettingsRow,
): Promise<ResolvedSynthesisSettings> {
  const provider = blankToNull(row.provider);
  const synthesisModel = blankToNull(row.synthesisModel);
  const baseUrl = blankToNull(row.baseUrl);
  const apiKey = blankToNull(row.apiKey);
  const maxTokens = positiveIntOrNull(row.maxTokens);
  const contextWindowTokens = positiveIntOrNull(row.contextWindowTokens);

  await getPrisma().appSynthesisSettings.upsert({
    where: { id: SETTINGS_ID },
    create: {
      id: SETTINGS_ID,
      provider,
      synthesisModel,
      baseUrl,
      apiKey,
      maxTokens,
      contextWindowTokens,
    },
    update: {
      provider,
      synthesisModel,
      baseUrl,
      apiKey,
      maxTokens,
      contextWindowTokens,
    },
  });

  return loadSynthesisSettings();
}

/** Load `app_synthesis_settings` id `default` and apply `SYNTHESIS_DEFAULTS` for nulls. */
export async function loadSynthesisSettings(): Promise<ResolvedSynthesisSettings> {
  return resolveSynthesisSettings(await fetchSynthesisRow());
}

export async function adminSynthesisSettings(): Promise<AdminSynthesisSettings> {
  return {
    ...storedSynthesisSettings(await fetchSynthesisRow()),
    defaults: {
      provider: SYNTHESIS_DEFAULTS.provider,
      synthesisModel: SYNTHESIS_DEFAULTS.synthesisModel,
      baseUrl: SYNTHESIS_DEFAULTS.baseUrl,
      apiKey: SYNTHESIS_DEFAULTS.apiKey,
      maxTokens: SYNTHESIS_DEFAULTS.maxTokens,
      contextWindowTokens: SYNTHESIS_DEFAULTS.contextWindowTokens,
    },
  };
}

/** Write hardcoded `SYNTHESIS_DEFAULTS` into the settings row. */
export async function resetSynthesisSettings(): Promise<AdminSynthesisSettings> {
  await saveSynthesisSettings({
    provider: SYNTHESIS_DEFAULTS.provider,
    synthesisModel: SYNTHESIS_DEFAULTS.synthesisModel,
    baseUrl: SYNTHESIS_DEFAULTS.baseUrl,
    apiKey: SYNTHESIS_DEFAULTS.apiKey,
    maxTokens: SYNTHESIS_DEFAULTS.maxTokens,
    contextWindowTokens: SYNTHESIS_DEFAULTS.contextWindowTokens,
  });
  return adminSynthesisSettings();
}
