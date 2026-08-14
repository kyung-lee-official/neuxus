import { db } from "../db.ts";
import {
  type ResolvedSynthesisSettings,
  resolveSynthesisSettings,
  type SynthesisSettingsRow,
} from "./defaults.ts";

const SETTINGS_ID = "default";

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

function intColumn(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && /^-?\d+$/.test(value)) {
    return Number.parseInt(value, 10);
  }
  return null;
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

  await db()`
    INSERT INTO app_synthesis_settings (
      id,
      provider,
      synthesis_model,
      base_url,
      api_key,
      max_tokens,
      context_window_tokens
    )
    VALUES (
      ${SETTINGS_ID},
      ${provider},
      ${synthesisModel},
      ${baseUrl},
      ${apiKey},
      ${maxTokens},
      ${contextWindowTokens}
    )
    ON CONFLICT (id) DO UPDATE SET
      provider = EXCLUDED.provider,
      synthesis_model = EXCLUDED.synthesis_model,
      base_url = EXCLUDED.base_url,
      api_key = EXCLUDED.api_key,
      max_tokens = EXCLUDED.max_tokens,
      context_window_tokens = EXCLUDED.context_window_tokens
  `;

  return loadSynthesisSettings();
}

/** Load `app_synthesis_settings` id `default` and apply `SYNTHESIS_DEFAULTS` for nulls. */
export async function loadSynthesisSettings(): Promise<ResolvedSynthesisSettings> {
  const rows = await db()`
    SELECT
      provider,
      synthesis_model,
      base_url,
      api_key,
      max_tokens,
      context_window_tokens
    FROM app_synthesis_settings
    WHERE id = ${SETTINGS_ID}
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) return resolveSynthesisSettings(null);
  return resolveSynthesisSettings({
    provider: typeof row.provider === "string" ? row.provider : null,
    synthesisModel:
      typeof row.synthesis_model === "string" ? row.synthesis_model : null,
    baseUrl: typeof row.base_url === "string" ? row.base_url : null,
    apiKey: typeof row.api_key === "string" ? row.api_key : null,
    maxTokens: intColumn(row.max_tokens),
    contextWindowTokens: intColumn(row.context_window_tokens),
  });
}
