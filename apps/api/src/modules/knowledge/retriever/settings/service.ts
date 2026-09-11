/**
 * Retriever-settings domain. Mirrors the `kb_embed_settings` /
 * `kb_chunk_settings` pattern: single row `id = "default"`, nullable
 * columns, code defaults in `RETRIEVE_DEFAULTS` apply when a column is null.
 */

import { findRetrieveSettings, upsertRetrieveSettings } from "./dal.ts";
import {
  RETRIEVE_DEFAULTS,
  type ResolvedRetrieveOptions,
  resolveRetrieveOptions,
} from "./defaults.ts";

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

export type AdminRetrieveSettings = StoredRetrieveSettings & {
  defaults: {
    childLimit: number;
    maxParents: number;
    maxCharacters: number;
  };
};

export abstract class RetrieverSettings {
  /** Resolved knobs used by the retriever (stored values or code defaults). */
  static async load(): Promise<ResolvedRetrieveOptions> {
    return resolveRetrieveOptions(await findRetrieveSettings());
  }

  /** Stored values + code defaults, for the admin form. */
  static async loadAdmin(): Promise<AdminRetrieveSettings> {
    const stored = storedRetrieveSettings(await findRetrieveSettings());
    return {
      ...stored,
      defaults: {
        childLimit: RETRIEVE_DEFAULTS.childLimit,
        maxParents: RETRIEVE_DEFAULTS.maxParents,
        maxCharacters: RETRIEVE_DEFAULTS.maxCharacters,
      },
    };
  }

  /** Upsert `kb_retrieve_settings` id `default`. Invalid values stored as null. */
  static async save(
    row: RetrieveSettingsRow,
  ): Promise<ResolvedRetrieveOptions> {
    await upsertRetrieveSettings({
      childLimit: positiveIntOrNull(row.childLimit),
      maxParents: positiveIntOrNull(row.maxParents),
      maxCharacters: positiveIntOrNull(row.maxCharacters),
    });

    return RetrieverSettings.load();
  }

  /** Write `RETRIEVE_DEFAULTS` into the row. */
  static async reset(): Promise<AdminRetrieveSettings> {
    await RetrieverSettings.save({
      childLimit: RETRIEVE_DEFAULTS.childLimit,
      maxParents: RETRIEVE_DEFAULTS.maxParents,
      maxCharacters: RETRIEVE_DEFAULTS.maxCharacters,
    });
    return RetrieverSettings.loadAdmin();
  }
}
