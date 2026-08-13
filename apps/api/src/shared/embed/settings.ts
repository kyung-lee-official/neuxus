import { db } from "../db.ts";
import {
  type ResolvedEmbedSettings,
  resolveEmbedSettings,
} from "./defaults.ts";

const SETTINGS_ID = "default";

/** Load `kb_embed_settings` id `default` and apply `EMBED_DEFAULTS` for nulls. */
export async function loadEmbedSettings(): Promise<ResolvedEmbedSettings> {
  const rows = await db()`
    SELECT embedding_model, provider, host, port, api_key
    FROM kb_embed_settings
    WHERE id = ${SETTINGS_ID}
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) return resolveEmbedSettings(null);
  return resolveEmbedSettings({
    embeddingModel:
      typeof row.embedding_model === "string" ? row.embedding_model : null,
    provider: typeof row.provider === "string" ? row.provider : null,
    host: typeof row.host === "string" ? row.host : null,
    port: typeof row.port === "number" ? row.port : null,
    apiKey: typeof row.api_key === "string" ? row.api_key : null,
  });
}
