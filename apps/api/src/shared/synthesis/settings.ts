import { db } from "../db.ts";
import {
  type ResolvedSynthesisSettings,
  resolveSynthesisSettings,
} from "./defaults.ts";

const SETTINGS_ID = "default";

function intColumn(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && /^-?\d+$/.test(value)) {
    return Number.parseInt(value, 10);
  }
  return null;
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
