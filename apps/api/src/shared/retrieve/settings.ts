/**
 * DB-backed retrieval knobs. Mirrors the `app_synthesis_settings` /
 * `kb_embed_settings` / `kb_chunk_settings` pattern: single row
 * `id = "default"`, nullable columns, code defaults in `RETRIEVE_DEFAULTS`
 * apply when a column is null.
 */

import { getPrisma } from "../db.ts";
import {
  RETRIEVE_DEFAULTS,
  type ResolvedRetrieveOptions,
  resolveRetrieveOptions,
} from "./defaults.ts";

const SETTINGS_ID = "default";

export type RetrieveSettingsRow = {
  childLimit?: number | null;
  maxParents?: number | null;
  maxCharacters?: number | null;
};

export type StoredRetrieveSettings = {
  childLimit: number | null;
  maxParents: number | null;
  maxCharacters: number | null;
};

function positiveIntOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : null;
}

function storedRetrieveSettings(
  row?: RetrieveSettingsRow | null,
): StoredRetrieveSettings {
  return {
    childLimit: positiveIntOrNull(row?.childLimit),
    maxParents: positiveIntOrNull(row?.maxParents),
    maxCharacters: positiveIntOrNull(row?.maxCharacters),
  };
}

async function fetchRetrieveRow(): Promise<RetrieveSettingsRow | null> {
  const row = await getPrisma().knowledgeRetrieveSettings.findUnique({
    where: { id: SETTINGS_ID },
  });
  if (!row) return null;
  return {
    childLimit: row.childLimit,
    maxParents: row.maxParents,
    maxCharacters: row.maxCharacters,
  };
}

export async function loadRetrieveSettings(): Promise<ResolvedRetrieveOptions> {
  return resolveRetrieveOptions(await fetchRetrieveRow());
}

export type AdminRetrieveSettings = StoredRetrieveSettings & {
  defaults: {
    childLimit: number;
    maxParents: number;
    maxCharacters: number;
  };
};

export async function adminRetrieveSettings(): Promise<AdminRetrieveSettings> {
  const stored = storedRetrieveSettings(await fetchRetrieveRow());
  return {
    ...stored,
    defaults: {
      childLimit: RETRIEVE_DEFAULTS.childLimit,
      maxParents: RETRIEVE_DEFAULTS.maxParents,
      maxCharacters: RETRIEVE_DEFAULTS.maxCharacters,
    },
  };
}

/** Upsert `kb_retrieve_settings` id `default`. Invalid values are stored as null. */
export async function saveRetrieveSettings(
  row: RetrieveSettingsRow,
): Promise<ResolvedRetrieveOptions> {
  const childLimit = positiveIntOrNull(row.childLimit);
  const maxParents = positiveIntOrNull(row.maxParents);
  const maxCharacters = positiveIntOrNull(row.maxCharacters);

  await getPrisma().knowledgeRetrieveSettings.upsert({
    where: { id: SETTINGS_ID },
    create: {
      id: SETTINGS_ID,
      childLimit,
      maxParents,
      maxCharacters,
    },
    update: {
      childLimit,
      maxParents,
      maxCharacters,
    },
  });

  return loadRetrieveSettings();
}

/** Write `RETRIEVE_DEFAULTS` into the row. */
export async function resetRetrieveSettings(): Promise<AdminRetrieveSettings> {
  await saveRetrieveSettings({
    childLimit: RETRIEVE_DEFAULTS.childLimit,
    maxParents: RETRIEVE_DEFAULTS.maxParents,
    maxCharacters: RETRIEVE_DEFAULTS.maxCharacters,
  });
  return adminRetrieveSettings();
}
